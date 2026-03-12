package relaymode

import "testing"

func TestGetByPath_Videos(t *testing.T) {
	if got := GetByPath("/v1/videos"); got != Videos {
		t.Fatalf("GetByPath(/v1/videos)=%d, want %d", got, Videos)
	}
	if got := GetByPath("/v1/videos/task_123"); got != Videos {
		t.Fatalf("GetByPath(/v1/videos/task_123)=%d, want %d", got, Videos)
	}
	if got := GetByPath("/api/v1/public/videos"); got != Videos {
		t.Fatalf("GetByPath(/api/v1/public/videos)=%d, want %d", got, Videos)
	}
}
