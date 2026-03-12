package middleware

import (
	"bytes"
	"mime/multipart"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestGetRequestModel_VideosMultipart(t *testing.T) {
	gin.SetMode(gin.TestMode)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if err := writer.WriteField("model", "veo-3.0-generate-preview"); err != nil {
		t.Fatalf("WriteField(model) error: %v", err)
	}
	if err := writer.WriteField("prompt", "test"); err != nil {
		t.Fatalf("WriteField(prompt) error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close error: %v", err)
	}

	req := httptest.NewRequest("POST", "/v1/videos", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req

	modelName, err := getRequestModel(c)
	if err != nil {
		t.Fatalf("getRequestModel returned error: %v", err)
	}
	if modelName != "veo-3.0-generate-preview" {
		t.Fatalf("getRequestModel returned %q, want %q", modelName, "veo-3.0-generate-preview")
	}
}

func TestGetRequestModel_VideoStatusQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	req := httptest.NewRequest("GET", "/v1/videos/task_123?model=veo-3.0-generate-preview", nil)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req

	modelName, err := getRequestModel(c)
	if err != nil {
		t.Fatalf("getRequestModel returned error: %v", err)
	}
	if modelName != "veo-3.0-generate-preview" {
		t.Fatalf("getRequestModel returned %q, want %q", modelName, "veo-3.0-generate-preview")
	}
}
