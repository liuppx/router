package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/logger"
	usercontroller "github.com/yeying-community/router/internal/admin/controller/user"
	"github.com/yeying-community/router/internal/admin/model"
)

const passportLoginTTL = 2 * time.Minute

type passportNodeResponse[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type passportNodeError struct {
	Status  int
	Message string
}

func (e *passportNodeError) Error() string {
	return fmt.Sprintf("夜莺通行证服务返回 %d: %s", e.Status, e.Message)
}

type passportAuthorizeRequestResult struct {
	RequestID string `json:"requestId"`
	VerifyURL string `json:"verifyUrl"`
	ExpiresAt string `json:"expiresAt"`
}

type passportExchangeResult struct {
	SubjectID     string `json:"subjectId"`
	WalletAddress string `json:"walletAddress"`
}

func passportConfiguration() (string, string, string, error) {
	nodeURL := strings.TrimRight(strings.TrimSpace(config.PassportNodeURL), "/")
	appID := strings.TrimSpace(config.PassportAppID)
	callbackURL := strings.TrimSpace(config.PassportCallbackURL)
	if callbackURL == "" {
		callbackURL = strings.TrimRight(strings.TrimSpace(config.ServerAddress), "/") + "/api/v1/public/oauth/passport/callback"
	}
	if nodeURL == "" || appID == "" {
		return "", "", "", errors.New("夜莺通行证登录尚未配置")
	}
	return nodeURL, appID, callbackURL, nil
}

func passportRandomURLValue(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func passportPKCEChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func passportNodePost[T any](ctx context.Context, nodeURL, path string, payload any, result *passportNodeResponse[T]) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, nodeURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices || result.Code != 0 {
		return &passportNodeError{Status: resp.StatusCode, Message: strings.TrimSpace(result.Message)}
	}
	return nil
}

func CreatePassportLoginSession(c *gin.Context) {
	nodeURL, appID, callbackURL, err := passportConfiguration()
	if err != nil {
		passportLoginError(c, err.Error())
		return
	}
	state, err := passportRandomURLValue(32)
	if err != nil {
		passportLoginError(c, "无法创建登录会话")
		return
	}
	verifier, err := passportRandomURLValue(64)
	if err != nil {
		passportLoginError(c, "无法创建登录会话")
		return
	}
	requestResult := passportNodeResponse[passportAuthorizeRequestResult]{}
	err = passportNodePost(c.Request.Context(), nodeURL, "/api/v1/public/auth/passport/authorize/request", gin.H{
		"appId": appID, "redirectUri": callbackURL, "state": state,
		"codeChallenge": passportPKCEChallenge(verifier), "codeChallengeMethod": "S256",
		"scopes":       []string{"identity.basic", "identity.wallet"},
		"requestTtlMs": passportLoginTTL.Milliseconds(),
	}, &requestResult)
	if err != nil || strings.TrimSpace(requestResult.Data.RequestID) == "" || strings.TrimSpace(requestResult.Data.VerifyURL) == "" {
		logger.LoginErrorf(c.Request.Context(), "passport authorize request failed err=%v message=%s", err, requestResult.Message)
		var nodeErr *passportNodeError
		if errors.As(err, &nodeErr) && nodeErr.Status == http.StatusForbidden && nodeErr.Message == "redirectUri is not allowed" {
			passportLoginError(c, "夜莺通行证未授权当前 Router 回调地址，请检查 Node 应用的 redirectUris 配置")
			return
		}
		passportLoginError(c, "无法连接夜莺通行证，请稍后重试")
		return
	}
	expiresAt := time.Now().Add(passportLoginTTL).Unix()
	if parsed, parseErr := time.Parse(time.RFC3339, requestResult.Data.ExpiresAt); parseErr == nil {
		expiresAt = parsed.Unix()
	}
	sessionID, err := passportRandomURLValue(32)
	if err != nil {
		passportLoginError(c, "无法创建登录会话")
		return
	}
	row := &model.PassportLoginSession{SessionID: sessionID, State: state, RequestID: requestResult.Data.RequestID, CodeVerifier: verifier, Status: model.PassportLoginSessionStatusPending, ExpiresAt: expiresAt}
	if err := model.DB.Create(row).Error; err != nil {
		logger.SysError("create passport login session failed: " + err.Error())
		passportLoginError(c, "无法保存登录会话")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"session_id": sessionID, "verify_url": requestResult.Data.VerifyURL, "expires_at": expiresAt, "poll_interval": 2}})
}

func PassportLoginStatus(c *gin.Context) {
	row, err := model.FindPassportLoginSessionByID(c.Query("session_id"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		passportLoginError(c, "登录会话不存在或已失效")
		return
	}
	if err != nil {
		passportLoginError(c, "无法读取登录会话")
		return
	}
	if time.Now().Unix() > row.ExpiresAt {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"status": "expired"}})
		return
	}
	if row.Status == model.PassportLoginSessionStatusPending {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"status": "pending"}})
		return
	}
	if row.Status == model.PassportLoginSessionStatusFailed {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"status": "failed", "message": row.ErrorMessage}})
		return
	}
	if row.Status == model.PassportLoginSessionStatusApproved {
		completePassportLogin(c, row)
		return
	}
	if row.Status == model.PassportLoginSessionStatusComplete {
		completePassportSessionResponse(c, row)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"status": "pending"}})
}

func PassportLoginCallback(c *gin.Context) {
	code, state := strings.TrimSpace(c.Query("code")), strings.TrimSpace(c.Query("state"))
	if code == "" || state == "" {
		c.String(http.StatusBadRequest, "Invalid Passport callback")
		return
	}
	row, err := model.FindPassportLoginSessionByState(state)
	if err != nil || time.Now().Unix() > row.ExpiresAt || row.Status != model.PassportLoginSessionStatusPending {
		c.String(http.StatusBadRequest, "Passport login request is invalid or expired")
		return
	}
	update := model.DB.Model(&model.PassportLoginSession{}).
		Where("session_id = ? AND status = ?", row.SessionID, model.PassportLoginSessionStatusPending).
		Updates(map[string]any{"status": model.PassportLoginSessionStatusApproved, "code": code})
	if update.Error != nil || update.RowsAffected != 1 {
		c.String(http.StatusInternalServerError, "Unable to complete Passport login")
		return
	}
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, "<!doctype html><title>Login complete</title><script>try{localStorage.setItem('__router_passport_callback__',String(Date.now()));new BroadcastChannel('router-passport-login').postMessage('approved')}catch(e){}setTimeout(function(){window.close()},300)</script>Login complete. You can return to Router.")
}

func completePassportLogin(c *gin.Context, row *model.PassportLoginSession) {
	nodeURL, appID, callbackURL, err := passportConfiguration()
	if err != nil {
		passportLoginError(c, err.Error())
		return
	}
	// Claim the code before exchanging it so parallel browser polls cannot use it twice.
	claim := model.DB.Model(&model.PassportLoginSession{}).
		Where("session_id = ? AND status = ?", row.SessionID, model.PassportLoginSessionStatusApproved).
		Update("status", "exchanging")
	if claim.Error != nil || claim.RowsAffected != 1 {
		passportLoginError(c, "无法完成登录")
		return
	}
	exchange := passportNodeResponse[passportExchangeResult]{}
	err = passportNodePost(c.Request.Context(), nodeURL, "/api/v1/public/auth/passport/authorize/exchange", gin.H{"code": row.Code, "appId": appID, "redirectUri": callbackURL, "codeVerifier": row.CodeVerifier}, &exchange)
	if err != nil {
		failPassportLogin(row, "夜莺通行证授权失败")
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"status": "failed", "message": "夜莺通行证授权失败"}})
		return
	}
	user, err := resolvePassportUser(exchange.Data.SubjectID, exchange.Data.WalletAddress)
	if err != nil {
		failPassportLogin(row, err.Error())
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"status": "unbound", "message": err.Error()}})
		return
	}
	if err := model.DB.Model(row).Updates(map[string]any{"status": model.PassportLoginSessionStatusComplete, "user_id": user.Id, "code": "", "code_verifier": ""}).Error; err != nil {
		passportLoginError(c, "无法完成登录")
		return
	}
	completePassportUserResponse(c, user)
}

func resolvePassportUser(subjectID, walletAddress string) (*model.User, error) {
	subjectID = strings.TrimSpace(subjectID)
	if subjectID == "" {
		return nil, errors.New("夜莺通行证未返回身份信息")
	}
	if binding, err := model.FindPassportIdentityBinding(subjectID); err == nil {
		user := &model.User{Id: binding.UserID}
		if err := user.FillUserById(); err != nil {
			return nil, errors.New("绑定的 Router 账户不存在")
		}
		if user.Status != model.UserStatusEnabled {
			return nil, errors.New("Router 账户不可用")
		}
		return user, nil
	}
	addr := model.NormalizeWalletAddress(walletAddress)
	if addr == "" {
		return nil, errors.New("此夜莺通行证尚未绑定 Router 账户")
	}
	user := &model.User{WalletAddress: &addr}
	if err := user.FillUserByWalletAddress(); err != nil || user.Status != model.UserStatusEnabled {
		return nil, errors.New("此夜莺通行证尚未绑定 Router 账户")
	}
	if err := model.UpsertPassportIdentityBinding(&model.PassportIdentityBinding{SubjectID: subjectID, UserID: user.Id, WalletAddress: addr}); err != nil {
		return nil, errors.New("无法绑定夜莺通行证身份")
	}
	return user, nil
}

func completePassportSessionResponse(c *gin.Context, row *model.PassportLoginSession) {
	user := &model.User{Id: row.UserID}
	if err := user.FillUserById(); err != nil || user.Status != model.UserStatusEnabled {
		passportLoginError(c, "Router 账户不可用")
		return
	}
	completePassportUserResponse(c, user)
}

func completePassportUserResponse(c *gin.Context, user *model.User) {
	if err := usercontroller.SetupSession(user, c); err != nil {
		passportLoginError(c, "无法保存会话信息，请重试")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"status": "complete", "user": gin.H{"id": user.Id, "username": user.Username, "display_name": user.DisplayName, "role": model.ExposedRole(user), "status": user.Status, "wallet_address": user.WalletAddress, "has_password": user.HasPassword, "can_manage_users": model.CanManageUsers(user)}}})
}

func failPassportLogin(row *model.PassportLoginSession, message string) {
	_ = model.DB.Model(row).Updates(map[string]any{"status": model.PassportLoginSessionStatusFailed, "error_message": message, "code": "", "code_verifier": ""}).Error
}
func passportLoginError(c *gin.Context, message string) {
	c.JSON(http.StatusOK, gin.H{"success": false, "message": message})
}
