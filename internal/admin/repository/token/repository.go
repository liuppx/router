package token

import (
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"

	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/common/random"
	"github.com/yeying-community/router/internal/admin/model"
)

func init() {
	model.BindTokenRepository(model.TokenRepository{
		GetAllUserTokens:         GetAll,
		GetFirstAvailableToken:   GetFirstAvailable,
		SearchUserTokens:         Search,
		ValidateUserToken:        ValidateUserToken,
		GetTokenByIds:            GetByIDs,
		GetTokenById:             GetByID,
		Insert:                   Create,
		Update:                   Update,
		SelectUpdate:             SelectUpdate,
		Delete:                   Delete,
		DeleteTokenById:          DeleteByID,
		IncreaseTokenQuota:       IncreaseQuota,
		DecreaseTokenQuota:       DecreaseQuota,
		IncreaseTokenQuotaDirect: IncreaseQuotaDirect,
		DecreaseTokenQuotaDirect: DecreaseQuotaDirect,
	})
}

var invalidateTokenCacheFn = model.InvalidateTokenCache

// tokenSortColumns 是令牌列表的排序白名单：order_by 值 -> 安全 SQL 列名。
// 所有列名均为代码常量，绝不来自请求原文。默认列为 created_time。
var tokenSortColumns = map[string]string{
	"created_time":         "created_time",
	"updated_time":         "updated_time",
	"accessed_time":        "accessed_time",
	"expired_time":         "expired_time",
	"remain_quota":         "remain_quota",
	"used_quota":           "used_quota",
	"remain_request_count": "remain_request_count",
	"used_request_count":   "used_request_count",
}

const tokenDefaultSortColumn = "created_time"

// buildTokenOrder 根据白名单把 order_by/order 转换为安全的 gorm Order 字符串。
// 列名只来自 tokenSortColumns，方向只来自 asc/desc 常量。
func buildTokenOrder(orderBy string, order string) string {
	direction := "desc"
	if strings.EqualFold(strings.TrimSpace(order), "asc") {
		direction = "asc"
	}
	column, ok := tokenSortColumns[strings.TrimSpace(orderBy)]
	if !ok {
		column = tokenDefaultSortColumn
	}
	// 兼容旧枚举语义：按剩余额度排序时,无限额度令牌排在最前。
	if column == "remain_quota" {
		return fmt.Sprintf("unlimited_quota %s, remain_quota %s", direction, direction)
	}
	return column + " " + direction
}

func GetAll(userId string, start, num int, orderBy string, order string) ([]*model.Token, error) {
	return GetAllFiltered(userId, start, num, orderBy, order, 0)
}

// GetAllFiltered 列出某用户的令牌,可选按状态过滤。statusFilter 传 0 表示不过滤。
func GetAllFiltered(userId string, start, num int, orderBy string, order string, statusFilter int) ([]*model.Token, error) {
	var tokens []*model.Token
	query := model.DB.Where("user_id = ?", userId)
	if statusFilter != 0 {
		query = query.Where("status = ?", statusFilter)
	}

	query = query.Order(buildTokenOrder(orderBy, order))

	err := query.Limit(num).Offset(start).Find(&tokens).Error
	return tokens, err
}

// CountFiltered 统计某用户令牌总数,过滤条件与 GetAllFiltered 保持一致。
func CountFiltered(userId string, statusFilter int) (int64, error) {
	query := model.DB.Model(&model.Token{}).Where("user_id = ?", userId)
	if statusFilter != 0 {
		query = query.Where("status = ?", statusFilter)
	}
	var total int64
	err := query.Count(&total).Error
	return total, err
}

func GetFirstAvailable(userId string) (*model.Token, error) {
	if strings.TrimSpace(userId) == "" {
		return nil, errors.New("user id is empty")
	}
	var token model.Token
	now := helper.GetTimestamp()
	err := model.DB.Where("user_id = ? AND status = ?", userId, model.TokenStatusEnabled).
		Where("(expired_time = -1 OR expired_time > ?)", now).
		Where("(unlimited_quota OR remain_quota > 0)").
		Where("(unlimited_request_count OR remain_request_count > 0)").
		Order("created_time asc").
		First(&token).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

func Search(userId string, keyword string) ([]*model.Token, error) {
	var tokens []*model.Token
	err := model.DB.Where("user_id = ?", userId).Where("name LIKE ?", keyword+"%").Find(&tokens).Error
	return tokens, err
}

func ValidateUserToken(key string) (*model.Token, error) {
	if key == "" {
		return nil, errors.New("未提供令牌")
	}
	token, err := model.CacheGetTokenByKey(key)
	if err != nil {
		logger.SysError("CacheGetTokenByKey failed: " + err.Error())
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("无效的令牌")
		}
		return nil, errors.New("令牌验证失败")
	}
	if token.Status == model.TokenStatusExhausted {
		return token, fmt.Errorf("令牌 %s（#%s）额度已用尽", token.Name, token.Id)
	} else if token.Status == model.TokenStatusExpired {
		return token, errors.New("该令牌已过期")
	}
	if token.Status != model.TokenStatusEnabled {
		return token, errors.New("该令牌状态不可用")
	}
	if token.ExpiredTime != -1 && token.ExpiredTime < helper.GetTimestamp() {
		if !common.RedisEnabled {
			token.Status = model.TokenStatusExpired
			err := SelectUpdate(token)
			if err != nil {
				logger.SysError("failed to update token status" + err.Error())
			}
		}
		return token, errors.New("该令牌已过期")
	}
	if !token.UnlimitedQuota && token.RemainQuota <= 0 {
		if !common.RedisEnabled {
			token.Status = model.TokenStatusExhausted
			err := SelectUpdate(token)
			if err != nil {
				logger.SysError("failed to update token status" + err.Error())
			}
		}
		return token, errors.New("该令牌额度已用尽")
	}
	if !token.UnlimitedRequestCount && token.RemainRequestCount <= 0 {
		if !common.RedisEnabled {
			token.Status = model.TokenStatusExhausted
			err := SelectUpdate(token)
			if err != nil {
				logger.SysError("failed to update token status" + err.Error())
			}
		}
		return token, errors.New("该令牌请求次数已用尽")
	}
	return token, nil
}

func GetByIDs(tokenId, userId string) (*model.Token, error) {
	if strings.TrimSpace(tokenId) == "" || strings.TrimSpace(userId) == "" {
		return nil, errors.New("id 或 userId 为空！")
	}
	token := model.Token{Id: tokenId, UserId: userId}
	err := model.DB.First(&token, "id = ? and user_id = ?", tokenId, userId).Error
	return &token, err
}

func GetByID(tokenId string) (*model.Token, error) {
	if strings.TrimSpace(tokenId) == "" {
		return nil, errors.New("id 为空！")
	}
	token := model.Token{Id: tokenId}
	err := model.DB.First(&token, "id = ?", tokenId).Error
	return &token, err
}

func Create(token *model.Token) error {
	if strings.TrimSpace(token.Id) == "" {
		token.Id = random.GetUUID()
	}
	if token.CreatedTime == 0 {
		token.CreatedTime = helper.GetTimestamp()
	}
	if token.UpdatedTime == 0 {
		token.UpdatedTime = token.CreatedTime
	}
	return model.DB.Create(token).Error
}

func Update(token *model.Token) error {
	if err := model.DB.Model(token).Select("name", "status", "expired_time", "remain_quota", "unlimited_quota", "remain_request_count", "unlimited_request_count", "models", "subnet", "updated_time").Updates(token).Error; err != nil {
		return err
	}
	return invalidateTokenCacheFn(token.Key)
}

func SelectUpdate(token *model.Token) error {
	return model.DB.Model(token).Select("accessed_time", "status").Updates(token).Error
}

func Delete(token *model.Token) error {
	if err := model.DB.Delete(token).Error; err != nil {
		return err
	}
	return invalidateTokenCacheFn(token.Key)
}

func DeleteByID(tokenId, userId string) error {
	if strings.TrimSpace(tokenId) == "" || strings.TrimSpace(userId) == "" {
		return errors.New("id 或 userId 为空！")
	}
	token := model.Token{Id: tokenId, UserId: userId}
	err := model.DB.Where(token).First(&token).Error
	if err != nil {
		return err
	}
	return Delete(&token)
}

func IncreaseQuota(id string, quota int64) error {
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	if config.BatchUpdateEnabled {
		model.AddBatchUpdateRecord(model.BatchUpdateTypeTokenQuota, id, quota)
		return nil
	}
	return IncreaseQuotaDirect(id, quota)
}

func IncreaseQuotaDirect(id string, quota int64) error {
	return model.DB.Model(&model.Token{}).Where("id = ?", id).Updates(
		map[string]interface{}{
			"remain_quota":  gorm.Expr("remain_quota + ?", quota),
			"used_quota":    gorm.Expr("used_quota - ?", quota),
			"accessed_time": helper.GetTimestamp(),
		},
	).Error
}

func DecreaseQuota(id string, quota int64) error {
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	if config.BatchUpdateEnabled {
		model.AddBatchUpdateRecord(model.BatchUpdateTypeTokenQuota, id, -quota)
		return nil
	}
	return DecreaseQuotaDirect(id, quota)
}

func DecreaseQuotaDirect(id string, quota int64) error {
	return model.DB.Model(&model.Token{}).Where("id = ?", id).Updates(
		map[string]interface{}{
			"remain_quota":  gorm.Expr("remain_quota - ?", quota),
			"used_quota":    gorm.Expr("used_quota + ?", quota),
			"accessed_time": helper.GetTimestamp(),
		},
	).Error
}
