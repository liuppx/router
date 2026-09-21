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
