package token

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/admin/presenter"
	tokensvc "github.com/yeying-community/router/internal/admin/service/token"
	usersvc "github.com/yeying-community/router/internal/admin/service/user"
	"gorm.io/gorm"
)

// ListAdminTokens 返回全站令牌分页列表(跨用户),支持 keyword/status/user_id 过滤与排序,
// 并富化属主用户名。仅挂在 AdminAuth 组下。
func ListAdminTokens(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	pageSize := resolvePageSize(c)
	statusFilter, _ := strconv.Atoi(c.Query("status"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	userID := strings.TrimSpace(c.Query("user_id"))
	orderBy := c.Query("order_by")
	order := c.Query("order")

	tokens, err := tokensvc.GetAllAdminFiltered((page-1)*pageSize, pageSize, orderBy, order, statusFilter, keyword, userID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	total, err := tokensvc.CountAdminFiltered(statusFilter, keyword, userID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	userIDs := make([]string, 0, len(tokens))
	for _, token := range tokens {
		if token != nil {
			userIDs = append(userIDs, token.UserId)
		}
	}
	nameByID := usersvc.GetUsernamesByIds(userIDs)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    presenter.NewAdminTokens(tokens, nameByID),
		"meta": gin.H{
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// GetAdminToken 按 id 取任意用户的令牌(无 user 作用域),供管理端编辑表单回填。
func GetAdminToken(c *gin.Context) {
	id := c.Param("id")
	if strings.TrimSpace(id) == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "id 为空",
		})
		return
	}
	token, err := tokensvc.GetByID(id)
	if err != nil {
		message := err.Error()
		code := ""
		if errors.Is(err, gorm.ErrRecordNotFound) {
			message = tokenNotFoundMessage
			code = tokenNotFoundCode
		}
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": message,
			"code":    code,
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    presenter.NewToken(token),
	})
}

// UpdateAdminToken 修改任意用户的令牌:status_only 用于启用/禁用,否则改额度/过期/模型等。
// 模型范围校验按令牌属主(而非当前 admin)进行,避免误判。
func UpdateAdminToken(c *gin.Context) {
	statusOnly := c.Query("status_only")
	token := model.Token{}
	if err := c.ShouldBindJSON(&token); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	normalizeTokenRequestCountLimit(&token)
	if err := validateToken(c, token); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "参数错误：" + err.Error(),
		})
		return
	}
	cleanToken, err := tokensvc.GetByID(token.Id)
	if err != nil {
		message := err.Error()
		code := ""
		if errors.Is(err, gorm.ErrRecordNotFound) {
			message = tokenNotFoundMessage
			code = tokenNotFoundCode
		}
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": message,
			"code":    code,
		})
		return
	}
	if token.Status == model.TokenStatusEnabled {
		if cleanToken.Status == model.TokenStatusExpired && cleanToken.ExpiredTime <= helper.GetTimestamp() && cleanToken.ExpiredTime != -1 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "令牌已过期，无法启用，请先修改令牌过期时间，或者设置为永不过期",
			})
			return
		}
		if cleanToken.Status == model.TokenStatusExhausted && cleanToken.RemainRequestCount <= 0 && !cleanToken.UnlimitedRequestCount {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "令牌请求次数已用尽，无法启用，请先修改令牌剩余请求次数，或者设置为不限次数",
			})
			return
		}
	}
	if statusOnly == "" || token.Status == model.TokenStatusEnabled {
		nextToken := *cleanToken
		if statusOnly != "" {
			nextToken.Status = token.Status
		} else {
			nextToken.Models = token.Models
		}
		if err := validateTokenModelEntitlement(c.Request.Context(), cleanToken.UserId, nextToken); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
	}
	if statusOnly != "" {
		cleanToken.Status = token.Status
	} else {
		cleanToken.Name = token.Name
		cleanToken.ExpiredTime = token.ExpiredTime
		cleanToken.RemainQuota = token.RemainQuota
		cleanToken.UnlimitedQuota = token.UnlimitedQuota
		cleanToken.RemainRequestCount = token.RemainRequestCount
		cleanToken.UnlimitedRequestCount = token.UnlimitedRequestCount
		cleanToken.Models = token.Models
		cleanToken.RoutePolicy = model.NormalizePersonalRoutePolicy(token.RoutePolicy)
		cleanToken.Subnet = token.Subnet
		cleanToken.UpdatedTime = helper.GetTimestamp()
	}
	if err := tokensvc.Update(cleanToken); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    presenter.NewToken(cleanToken),
	})
}

// DeleteAdminToken 删除任意用户的令牌(带缓存失效)。
func DeleteAdminToken(c *gin.Context) {
	id := c.Param("id")
	if strings.TrimSpace(id) == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "id 为空",
		})
		return
	}
	token, err := tokensvc.GetByID(id)
	if err != nil {
		message := err.Error()
		code := ""
		if errors.Is(err, gorm.ErrRecordNotFound) {
			message = tokenNotFoundMessage
			code = tokenNotFoundCode
		}
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": message,
			"code":    code,
		})
		return
	}
	if err := tokensvc.Delete(token); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}
