package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common"
	usercontroller "github.com/yeying-community/router/internal/admin/controller/user"
	"github.com/yeying-community/router/internal/admin/model"
)

type identityLoginRequest struct {
	Address string `json:"address"`
}

type identityPresentationRequest struct {
	SessionID    string         `json:"session_id"`
	RequestID    string         `json:"request_id"`
	Address      string         `json:"address"`
	Presentation map[string]any `json:"presentation"`
}

type identityAccountLinkChallengeRequest struct {
	Identity string `json:"identity"`
	ChainKey string `json:"chainKey"`
	Address  string `json:"address"`
}

type identityAccountLinkVerifyRequest struct {
	IdentityDocument map[string]any `json:"identityDocument"`
	Identity         string         `json:"identity"`
	ChainKey         string         `json:"chainKey"`
	Address          string         `json:"address"`
	Nonce            string         `json:"nonce"`
	IssuedAt         string         `json:"issuedAt"`
	ExpiresAt        string         `json:"expiresAt"`
	AccountSignature string         `json:"accountSignature"`
	WalletIdentityID string         `json:"walletIdentityId"`
	DID              string         `json:"did"`
}

type identityAuthorizationRequestResult struct {
	RequestID string   `json:"requestId"`
	Nonce     string   `json:"nonce"`
	Audience  string   `json:"audience"`
	Scopes    []string `json:"scopes"`
	ExpiresAt string   `json:"expiresAt"`
}

type identityAuthorizationApproveResult struct {
	AuthorizationCode string `json:"authorizationCode"`
}

type identityAuthorizationExchangeResult struct {
	WalletIdentityID string   `json:"walletIdentityId"`
	DID              string   `json:"did"`
	Scopes           []string `json:"scopes"`
	Credentials      []struct {
		Type         string `json:"type"`
		CredentialID string `json:"credentialId"`
		Credential   string `json:"credential"`
	} `json:"credentials"`
}

var routerIdentityScopes = []string{"identity.basic", "identity.wallet", "identity.email"}

func CreateIdentityLoginSession(c *gin.Context) {
	nodeURL, appID, callbackURL, err := passportConfiguration()
	if err != nil {
		identityError(c, err.Error())
		return
	}
	state, err := passportRandomURLValue(32)
	if err != nil {
		identityError(c, "无法创建登录会话")
		return
	}
	verifier, err := passportRandomURLValue(64)
	if err != nil {
		identityError(c, "无法创建登录会话")
		return
	}
	result := passportNodeResponse[identityAuthorizationRequestResult]{}
	if err = passportNodePost(c.Request.Context(), nodeURL, "/api/v1/public/identity/authorize/request", gin.H{
		"appId": appID, "redirectUri": callbackURL, "state": state,
		"codeChallenge": passportPKCEChallenge(verifier), "codeChallengeMethod": "S256", "scopes": routerIdentityScopes,
	}, &result); err != nil || result.Data.RequestID == "" {
		identityError(c, "无法创建夜莺身份授权请求")
		return
	}
	expiresAt := time.Now().Add(5 * time.Minute).Unix()
	if parsed, parseErr := time.Parse(time.RFC3339, result.Data.ExpiresAt); parseErr == nil {
		expiresAt = parsed.Unix()
	}
	sessionID, err := passportRandomURLValue(32)
	if err != nil {
		identityError(c, "无法创建登录会话")
		return
	}
	row := &model.PassportLoginSession{SessionID: sessionID, State: state, RequestID: result.Data.RequestID, CodeVerifier: verifier, Status: model.PassportLoginSessionStatusPending, ExpiresAt: expiresAt}
	if err := model.DB.Create(row).Error; err != nil {
		identityError(c, "无法保存登录会话")
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"session_id": sessionID, "request_id": result.Data.RequestID, "app_id": appID, "nonce": result.Data.Nonce, "audience": result.Data.Audience, "scopes": result.Data.Scopes, "verify_url": callbackURL, "expires_at": expiresAt}})
}

func VerifyIdentityWalletLogin(c *gin.Context) {
	var req identityPresentationRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.SessionID == "" || req.Presentation == nil {
		identityError(c, "参数错误")
		return
	}
	row, err := model.FindPassportLoginSessionByID(req.SessionID)
	if err != nil || row.Status != model.PassportLoginSessionStatusPending || time.Now().Unix() > row.ExpiresAt {
		identityError(c, "登录会话无效或已过期")
		return
	}
	nodeURL, appID, callbackURL, err := passportConfiguration()
	if err != nil {
		identityError(c, err.Error())
		return
	}
	approve := passportNodeResponse[identityAuthorizationApproveResult]{}
	if err = passportNodePost(c.Request.Context(), nodeURL, "/api/v1/public/identity/authorize/approve", gin.H{"requestId": row.RequestID, "presentation": req.Presentation}, &approve); err != nil || approve.Data.AuthorizationCode == "" {
		identityError(c, "夜莺身份授权未通过")
		return
	}
	exchange := passportNodeResponse[identityAuthorizationExchangeResult]{}
	if err = passportNodePost(c.Request.Context(), nodeURL, "/api/v1/public/identity/authorize/exchange", gin.H{"code": approve.Data.AuthorizationCode, "appId": appID, "redirectUri": callbackURL, "codeVerifier": row.CodeVerifier}, &exchange); err != nil {
		identityError(c, "夜莺身份兑换失败")
		return
	}
	if exchange.Data.WalletIdentityID == "" || exchange.Data.DID == "" || !identityScopeIncluded(exchange.Data.Scopes, "identity.basic") {
		identityError(c, "夜莺身份声明无效")
		return
	}
	if identityScopeIncluded(exchange.Data.Scopes, "identity.email") && !identityCredentialIncluded(exchange.Data.Credentials, "EmailCredential") {
		identityError(c, "夜莺身份邮箱凭证无效或未配置")
		return
	}
	user, err := resolveWalletIdentityUser(exchange.Data.WalletIdentityID, exchange.Data.DID, req.Address, c.Request.Context())
	if err != nil {
		identityErrorReason(c, "请在夜莺钱包中继续完成登录确认", "wallet_confirmation_required")
		return
	}
	if err := model.DB.Model(row).Updates(map[string]any{"status": model.PassportLoginSessionStatusComplete, "user_id": user.Id, "code": "", "code_verifier": ""}).Error; err != nil {
		identityError(c, "无法保存登录会话")
		return
	}
	if err := usercontroller.SetupSession(user, c); err != nil {
		identityError(c, "无法保存会话信息，请重试")
		return
	}
	addr := ""
	if user.WalletAddress != nil {
		addr = model.NormalizeWalletAddress(*user.WalletAddress)
	}
	token, exp, tokenErr := common.GenerateWalletJWT(user.Id, addr)
	if tokenErr != nil {
		identityError(c, "生成 token 失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"token": token, "expires_at": exp.UnixMilli(), "wallet_identity_id": exchange.Data.WalletIdentityID, "did": exchange.Data.DID, "user": user}})
}

func CreateIdentityAccountLinkChallenge(c *gin.Context) {
	var req identityAccountLinkChallengeRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Identity) == "" || strings.TrimSpace(req.Address) == "" {
		identityError(c, "参数错误")
		return
	}
	nodeURL, _, _, err := passportConfiguration()
	if err != nil {
		identityError(c, err.Error())
		return
	}
	result := passportNodeResponse[map[string]any]{}
	if err := passportNodePost(c.Request.Context(), nodeURL, "/api/v1/public/identity/account-links/challenge", gin.H{"identity": req.Identity, "account": gin.H{"chainKey": req.ChainKey, "address": req.Address}}, &result); err != nil {
		identityError(c, "无法创建身份绑定请求")
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": result.Data})
}

func VerifyIdentityAccountLink(c *gin.Context) {
	var req identityAccountLinkVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.IdentityDocument == nil || strings.TrimSpace(req.Identity) == "" {
		identityError(c, "参数错误")
		return
	}
	nodeURL, _, _, err := passportConfiguration()
	if err != nil {
		identityError(c, err.Error())
		return
	}
	result := passportNodeResponse[map[string]any]{}
	if err := passportNodePost(c.Request.Context(), nodeURL, "/api/v1/public/identity/account-links/verify", gin.H{
		"identityDocument": req.IdentityDocument, "identity": req.Identity,
		"account": gin.H{"chainKey": req.ChainKey, "address": req.Address}, "nonce": req.Nonce,
		"issuedAt": req.IssuedAt, "expiresAt": req.ExpiresAt, "accountSignature": req.AccountSignature,
	}, &result); err != nil {
		identityError(c, "身份账户绑定验证失败")
		return
	}
	identityID := strings.TrimSpace(req.WalletIdentityID)
	if identityID == "" {
		identityID = strings.TrimPrefix(req.Identity, "did:yeying:")
	}
	addr := model.NormalizeWalletAddress(req.Address)
	user := &model.User{WalletAddress: &addr}
	if err := user.FillUserByWalletAddress(); err != nil || user.Status != model.UserStatusEnabled {
		identityError(c, "该钱包尚未绑定 Router 账户")
		return
	}
	if err := model.UpsertWalletIdentityBinding(&model.WalletIdentityBinding{WalletIdentityID: identityID, DID: req.Identity, UserID: user.Id, WalletAddress: addr}); err != nil {
		identityError(c, "无法保存身份绑定")
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"wallet_identity_id": identityID, "did": req.Identity, "user_id": user.Id, "result": result.Data}})
}

func resolveWalletIdentityUser(identityID, did, walletAddress string, ctx context.Context) (*model.User, error) {
	if binding, err := model.FindWalletIdentityBinding(identityID); err == nil {
		user := &model.User{Id: binding.UserID}
		if err := user.FillUserById(); err != nil || user.Status != model.UserStatusEnabled {
			return nil, errors.New("Router 账户不可用")
		}
		return user, nil
	}
	// Do not bind from a browser-supplied address. Identity authorization proves
	// the DID; account-link proof is required before creating a local binding.
	_ = walletAddress
	_ = ctx
	return nil, errors.New("wallet identity is not associated with a Router user")
}

func identityScopeIncluded(scopes []string, target string) bool {
	for _, scope := range scopes {
		if strings.EqualFold(strings.TrimSpace(scope), target) {
			return true
		}
	}
	return false
}

func identityCredentialIncluded(credentials []struct {
	Type         string `json:"type"`
	CredentialID string `json:"credentialId"`
	Credential   string `json:"credential"`
}, target string) bool {
	for _, credential := range credentials {
		if credential.Type == target && strings.TrimSpace(credential.CredentialID) != "" && strings.TrimSpace(credential.Credential) != "" {
			return true
		}
	}
	return false
}
func identityError(c *gin.Context, message string) {
	c.JSON(http.StatusOK, gin.H{"code": 1, "message": message})
}

func identityErrorReason(c *gin.Context, message, reason string) {
	c.JSON(http.StatusOK, gin.H{"code": 1, "message": message, "reason": reason})
}
