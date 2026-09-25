package token

import (
	"github.com/yeying-community/router/internal/admin/model"
	tokenrepo "github.com/yeying-community/router/internal/admin/repository/token"
)

func GetAll(userId string, start, num int, orderBy string, order string) ([]*model.Token, error) {
	return tokenrepo.GetAll(userId, start, num, orderBy, order)
}

func GetAllFiltered(userId string, start, num int, orderBy string, order string, statusFilter int) ([]*model.Token, error) {
	return tokenrepo.GetAllFiltered(userId, start, num, orderBy, order, statusFilter)
}

func CountFiltered(userId string, statusFilter int) (int64, error) {
	return tokenrepo.CountFiltered(userId, statusFilter)
}

// GetAllAdminFiltered 列出全站令牌(跨用户),供 admin 令牌管理页使用。
func GetAllAdminFiltered(start, num int, orderBy, order string, statusFilter int, keyword, userID string) ([]*model.Token, error) {
	return tokenrepo.GetAllAdminFiltered(start, num, orderBy, order, statusFilter, keyword, userID)
}

// CountAdminFiltered 统计全站令牌总数,过滤条件与 GetAllAdminFiltered 一致。
func CountAdminFiltered(statusFilter int, keyword, userID string) (int64, error) {
	return tokenrepo.CountAdminFiltered(statusFilter, keyword, userID)
}

func Search(userId string, keyword string) ([]*model.Token, error) {
	return tokenrepo.Search(userId, keyword)
}

func GetByIDs(tokenId, userId string) (*model.Token, error) {
	return tokenrepo.GetByIDs(tokenId, userId)
}

func GetByID(tokenId string) (*model.Token, error) {
	return tokenrepo.GetByID(tokenId)
}

func Create(token *model.Token) error {
	return tokenrepo.Create(token)
}

func Update(token *model.Token) error {
	return tokenrepo.Update(token)
}

func DeleteByID(tokenId, userId string) error {
	return tokenrepo.DeleteByID(tokenId, userId)
}

// Delete 按令牌对象删除(不加 user 作用域),供 admin 管理任意用户令牌使用。
func Delete(token *model.Token) error {
	return tokenrepo.Delete(token)
}
