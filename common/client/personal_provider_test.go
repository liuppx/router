package client

import "testing"

func TestValidatePersonalProviderBaseURL(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{name: "empty uses protocol default", value: ""},
		{name: "public ipv4", value: "https://1.1.1.1/v1"},
		{name: "http is rejected", value: "http://1.1.1.1/v1", wantErr: true},
		{name: "loopback is rejected", value: "https://127.0.0.1/v1", wantErr: true},
		{name: "private ipv4 is rejected", value: "https://10.0.0.8/v1", wantErr: true},
		{name: "carrier nat is rejected", value: "https://100.64.0.1/v1", wantErr: true},
		{name: "localhost is rejected", value: "https://localhost/v1", wantErr: true},
		{name: "userinfo is rejected", value: "https://user:pass@1.1.1.1/v1", wantErr: true},
		{name: "query is rejected", value: "https://1.1.1.1/v1?target=elsewhere", wantErr: true},
		{name: "fragment is rejected", value: "https://1.1.1.1/v1#fragment", wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := ValidatePersonalProviderBaseURL(test.value)
			if (err != nil) != test.wantErr {
				t.Fatalf("ValidatePersonalProviderBaseURL(%q) error = %v, wantErr %v", test.value, err, test.wantErr)
			}
		})
	}
}
