package model

const (
	ProviderModelPriceComponentsTableName = "provider_model_price_components"
)

type ProviderModelPriceComponent struct {
	Provider    string  `json:"provider" gorm:"primaryKey;type:varchar(64)"`
	Model       string  `json:"model" gorm:"primaryKey;type:varchar(255)"`
	Component   string  `json:"component" gorm:"primaryKey;type:varchar(64)"`
	Condition   string  `json:"condition" gorm:"primaryKey;type:varchar(255);default:''"`
	InputPrice  float64 `json:"input_price" gorm:"type:double precision;default:0"`
	OutputPrice float64 `json:"output_price" gorm:"type:double precision;default:0"`
	PriceUnit   string  `json:"price_unit" gorm:"type:varchar(64);default:'per_1k_tokens'"`
	Currency    string  `json:"currency" gorm:"type:varchar(16);default:'USD'"`
	Source      string  `json:"source" gorm:"type:varchar(32);default:'manual'"`
	SourceURL   string  `json:"source_url" gorm:"type:text;default:''"`
	SortOrder   int     `json:"sort_order" gorm:"type:int;default:0"`
	UpdatedAt   int64   `json:"updated_at" gorm:"bigint"`
}

func (ProviderModelPriceComponent) TableName() string {
	return ProviderModelPriceComponentsTableName
}
