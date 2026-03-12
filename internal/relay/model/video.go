package model

type VideoRequest struct {
	Model      string `json:"model" form:"model"`
	Prompt     string `json:"prompt" form:"prompt"`
	Seconds    int    `json:"seconds,omitempty" form:"seconds"`
	Duration   string `json:"duration,omitempty" form:"duration"`
	Resolution string `json:"resolution,omitempty" form:"resolution"`
	Size       string `json:"size,omitempty" form:"size"`
	Quality    string `json:"quality,omitempty" form:"quality"`
}
