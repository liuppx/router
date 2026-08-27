package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/common/random"
	usercontroller "github.com/yeying-community/router/internal/admin/controller/user"
	"github.com/yeying-community/router/internal/admin/model"
)

// Identity login session is created and verified locally without forwarding
// the presentation to Node. Router verifies the Ed25519 presentation signature
// itself; Node is only the credential issuer, not the login authority.

type identityPresentationRequest struct {
	SessionID    string          `json:"session_id"`
	RequestID    string          `json:"request_id"`
	Address      string          `json:"address"`
	Presentation json.RawMessage `json:"presentation"`
}

var routerIdentityRequiredScopes = []string{"identity.basic", "identity.wallet", "identity.email"}
var routerIdentityAvatarScopes = []string{"identity.basic", "identity.wallet", "identity.email", "identity.avatar"}

func identityRandomURLValue(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func identityServerAudience() string {
	return strings.TrimRight(strings.TrimSpace(config.ServerAddress), "/")
}

func CreateIdentityLoginSession(c *gin.Context) {
	nonce, err := identityRandomURLValue(32)
	if err != nil {
		identityError(c, "无法创建登录会话")
		return
	}
	sessionID, err := identityRandomURLValue(32)
	if err != nil {
		identityError(c, "无法创建登录会话")
		return
	}
	expiresAt := time.Now().Add(5 * time.Minute).Unix()
	audience := identityServerAudience()
	scopes := routerIdentityScopes(c.Query("avatar") != "0")
	row := &model.IdentityLoginSession{
		SessionID: sessionID,
		Nonce:     nonce,
		Audience:  audience,
		AppID:     "",
		Scopes:    strings.Join(scopes, " "),
		Status:    model.IdentityLoginSessionStatusPending,
		ExpiresAt: expiresAt,
	}
	if err := model.DB.Create(row).Error; err != nil {
		logger.SysError("create identity login session failed: " + err.Error())
		identityError(c, "无法保存登录会话")
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data": gin.H{
			"session_id": sessionID,
			"nonce":      nonce,
			"audience":   audience,
			"scopes":     scopes,
			"expires_at": expiresAt,
		},
	})
}

func VerifyIdentityWalletLogin(c *gin.Context) {
	var req identityPresentationRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.SessionID == "" || len(req.Presentation) == 0 {
		identityError(c, "参数错误")
		return
	}
	row, err := model.FindIdentityLoginSessionByID(req.SessionID)
	if err != nil || row.Status != model.IdentityLoginSessionStatusPending || time.Now().Unix() > row.ExpiresAt {
		identityError(c, "登录会话无效或已过期")
		return
	}

	// Verify the presentation signature locally
	pres, err := common.VerifyIdentityPresentation(req.Presentation, row.Audience, row.Nonce)
	if err != nil {
		identityError(c, "夜莺身份验证失败: "+err.Error())
		return
	}
	if !identityPresentationHasScope(pres.Scopes, "identity.email") || !identityPresentationHasCredential(pres.Credentials, "EmailCredential") {
		identityError(c, "Router 需要已验证邮箱，请先在夜莺钱包插件中完成钱包身份验证和邮箱验证")
		return
	}

	// Verify wallet address from the presentation matches the request
	walletProofAddr := extractWalletProofAddress(req.Presentation)
	if walletProofAddr == "" {
		walletProofAddr = req.Address
	}
	addr := model.NormalizeWalletAddress(walletProofAddr)
	if addr == "" {
		identityError(c, "钱包地址无效")
		return
	}

	// Resolve or create the local Router user by wallet identity DID. Wallet
	// address is only the verified account associated with this identity.
	user, err := resolveWalletIdentityUser(pres.Holder, addr, c.Request.Context())
	if err != nil {
		identityError(c, err.Error())
		return
	}
	if email := identityPresentationEmail(pres.Credentials); email != "" {
		if err := model.SyncIdentityEmail(user.Id, email); err != nil {
			logger.SysError("sync wallet identity email failed: " + err.Error())
			identityError(c, "无法同步钱包身份邮箱")
			return
		}
	}
	if avatarURL := model.NormalizeIdentityAvatarURL(identityPresentationAvatarURL(pres.Credentials)); avatarURL != "" {
		if err := model.SyncIdentityAvatarURL(user.Id, avatarURL); err != nil {
			logger.SysError("sync wallet identity avatar failed: " + err.Error())
		} else {
			user.AvatarURL = avatarURL
		}
	}

	// Mark session complete
	if err := model.DB.Model(row).Updates(map[string]any{
		"status":  model.IdentityLoginSessionStatusComplete,
		"user_id": user.Id,
	}).Error; err != nil {
		logger.SysError("complete identity login session failed: " + err.Error())
		identityError(c, "无法保存登录会话")
		return
	}

	if err := usercontroller.SetupSession(user, c); err != nil {
		identityError(c, "无法保存会话信息，请重试")
		return
	}

	userAddr := ""
	if user.WalletAddress != nil {
		userAddr = model.NormalizeWalletAddress(*user.WalletAddress)
	}
	userDID := ""
	if user.WalletIdentityDID != nil {
		userDID = model.NormalizeWalletIdentityDID(*user.WalletIdentityDID)
	}
	token, exp, tokenErr := common.GenerateWalletJWT(user.Id, userAddr, userDID)
	if tokenErr != nil {
		identityError(c, "生成 token 失败")
		return
	}

	// Also generate refresh token
	refreshToken, refreshExp, refreshErr := common.GenerateWalletRefreshJWT(user.Id, userAddr, userDID)
	if refreshErr == nil {
		setWalletRefreshCookie(c, refreshToken, refreshExp)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data": gin.H{
			"token":              token,
			"expires_at":         exp.UnixMilli(),
			"refresh_expires_at": refreshExp.UnixMilli(),
			"did":                pres.Holder,
			"walletAddress":      userAddr,
			"user":               user,
		},
	})
}

// extractWalletProofAddress reads the walletProof.address from the presentation JSON.
func extractWalletProofAddress(presentation json.RawMessage) string {
	var raw map[string]any
	if err := json.Unmarshal(presentation, &raw); err != nil {
		return ""
	}
	proof, ok := raw["walletProof"].(map[string]any)
	if !ok {
		return ""
	}
	addr, _ := proof["address"].(string)
	return addr
}

func identityPresentationHasScope(scopes []string, target string) bool {
	for _, scope := range scopes {
		if strings.EqualFold(strings.TrimSpace(scope), target) {
			return true
		}
	}
	return false
}

func identityPresentationHasCredential(credentials []string, credentialType string) bool {
	for _, token := range credentials {
		if identityCredentialType(token) == credentialType {
			return true
		}
	}
	return false
}

func identityCredentialType(token string) string {
	credentialType, _ := identityCredentialTypeAndSubject(token)
	return credentialType
}

func identityCredentialTypeAndSubject(token string) (string, map[string]any) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return "", nil
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", nil
	}
	var claims map[string]any
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", nil
	}
	vc, ok := claims["vc"].(map[string]any)
	if !ok {
		return "", nil
	}
	rawTypes, ok := vc["type"].([]any)
	if !ok {
		return "", nil
	}
	subject, _ := vc["credentialSubject"].(map[string]any)
	credentialType := ""
	for _, item := range rawTypes {
		if value, ok := item.(string); ok && value != "VerifiableCredential" {
			credentialType = value
			break
		}
	}
	return credentialType, subject
}

func identityCredentialSubjectString(credentials []string, credentialType string, keys ...string) string {
	for _, token := range credentials {
		actualType, subject := identityCredentialTypeAndSubject(token)
		if actualType != credentialType || subject == nil {
			continue
		}
		for _, key := range keys {
			value, _ := subject[key].(string)
			value = strings.TrimSpace(value)
			if value != "" {
				return value
			}
		}
	}
	return ""
}

func identityPresentationEmail(credentials []string) string {
	return strings.ToLower(identityCredentialSubjectString(credentials, "EmailCredential", "email"))
}

func identityPresentationAvatarURL(credentials []string) string {
	return identityCredentialSubjectString(credentials, "AvatarCredential", "avatarUri", "avatarUrl", "avatar")
}

func routerIdentityScopes(includeAvatar bool) []string {
	if includeAvatar {
		return routerIdentityAvatarScopes
	}
	return routerIdentityRequiredScopes
}

func resolveWalletIdentityUser(did string, walletAddress string, ctx context.Context) (*model.User, error) {
	identityDID := model.NormalizeWalletIdentityDID(did)
	if identityDID == "" {
		return nil, errors.New("钱包身份 DID 无效")
	}
	addr := model.NormalizeWalletAddress(walletAddress)
	if addr == "" {
		return nil, errors.New("钱包地址无效")
	}
	user, err := findOrCreateWalletIdentityUser(identityDID, addr, ctx)
	if err != nil || user.Status != model.UserStatusEnabled {
		return nil, errors.New("此钱包尚未关联 Router 账户")
	}
	return user, nil
}

func findOrCreateWalletIdentityUser(did string, addr string, ctx context.Context) (*model.User, error) {
	identityDID := model.NormalizeWalletIdentityDID(did)
	if identityDID == "" {
		return nil, errors.New("钱包身份 DID 无效")
	}
	normalizedAddress := model.NormalizeWalletAddress(addr)
	if normalizedAddress == "" {
		return nil, errors.New("钱包地址无效")
	}
	user := model.User{WalletIdentityDID: &identityDID}
	if err := user.FillUserByWalletIdentityDID(); err == nil {
		if user.Status == model.UserStatusDeleted {
			_ = model.DB.Model(&user).Updates(map[string]any{"wallet_identity_did": nil, "wallet_address": nil})
			return findOrCreateWalletIdentityUser(identityDID, normalizedAddress, ctx)
		}
		syncWalletIdentityAddress(&user, normalizedAddress)
		return &user, nil
	}

	legacy := model.User{WalletAddress: &normalizedAddress}
	if err := legacy.FillUserByWalletAddress(); err == nil {
		if legacy.Status == model.UserStatusDeleted {
			_ = model.DB.Model(&legacy).Update("wallet_address", nil)
			return findOrCreateWalletIdentityUser(identityDID, normalizedAddress, ctx)
		}
		if legacy.WalletIdentityDID == nil || model.NormalizeWalletIdentityDID(*legacy.WalletIdentityDID) == "" {
			_ = model.DB.Model(&legacy).Update("wallet_identity_did", identityDID)
			legacy.WalletIdentityDID = &identityDID
		}
		return &legacy, nil
	}

	if !config.AutoRegisterEnabled {
		return nil, errors.New("未找到钱包身份关联的账户，请先绑定或由管理员开启自动注册")
	}
	return autoCreateWalletIdentityUser(identityDID, normalizedAddress, ctx)
}

func syncWalletIdentityAddress(user *model.User, addr string) {
	if user == nil {
		return
	}
	normalized := model.NormalizeWalletAddress(addr)
	if normalized == "" {
		return
	}
	if user.WalletAddress != nil && model.NormalizeWalletAddress(*user.WalletAddress) == normalized {
		return
	}
	if model.IsWalletAddressAlreadyTaken(normalized) {
		return
	}
	_ = model.DB.Model(user).Update("wallet_address", normalized)
	user.WalletAddress = &normalized
}

func autoCreateWalletIdentityUser(did string, addr string, ctx context.Context) (*model.User, error) {
	username := "wallet_" + random.GetRandomString(6)
	for model.IsUsernameAlreadyTaken(username) {
		username = "wallet_" + random.GetRandomString(6)
	}
	identityDID := model.NormalizeWalletIdentityDID(did)
	walletAddress := model.NormalizeWalletAddress(addr)
	user := model.User{
		Username:          username,
		Password:          random.GetRandomString(16),
		DisplayName:       username,
		Role:              model.RoleCommonUser,
		Status:            model.UserStatusEnabled,
		WalletIdentityDID: &identityDID,
		WalletAddress:     &walletAddress,
		HasPassword:       false,
	}
	if err := user.Insert(ctx, ""); err != nil {
		return nil, err
	}
	return &user, nil
}

func identityError(c *gin.Context, message string) {
	c.JSON(http.StatusOK, gin.H{"code": 1, "message": message})
}
