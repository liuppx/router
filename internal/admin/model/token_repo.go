package model

type TokenRepository struct {
	GetAllUserTokens         func(userId string, startIdx int, num int, orderBy string, order string) ([]*Token, error)
	GetFirstAvailableToken   func(userId string) (*Token, error)
	SearchUserTokens         func(userId string, keyword string) ([]*Token, error)
	ValidateUserToken        func(key string) (*Token, error)
	GetTokenByIds            func(id string, userId string) (*Token, error)
	GetTokenById             func(id string) (*Token, error)
	Insert                   func(token *Token) error
	Update                   func(token *Token) error
	SelectUpdate             func(token *Token) error
	Delete                   func(token *Token) error
	DeleteTokenById          func(id string, userId string) error
	IncreaseTokenQuota       func(id string, quota int64) error
	DecreaseTokenQuota       func(id string, quota int64) error
	IncreaseTokenQuotaDirect func(id string, quota int64) error
	DecreaseTokenQuotaDirect func(id string, quota int64) error
}

var tokenRepo TokenRepository

func BindTokenRepository(repo TokenRepository) {
	tokenRepo = repo
}

func mustTokenRepo() TokenRepository {
	if tokenRepo.GetTokenById == nil {
		panic("token repository not initialized")
	}
	return tokenRepo
}
