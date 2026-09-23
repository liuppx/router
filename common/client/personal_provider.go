package client

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

const personalProviderHostLookupTimeout = 3 * time.Second

// PersonalProviderHTTPClient is deliberately separate from the shared relay
// client. A personal connection has a user-controlled Base URL, so its dialer
// resolves and dials only public addresses and never follows redirects.
var PersonalProviderHTTPClient = newPersonalProviderHTTPClient()

// ValidatePersonalProviderBaseURL validates a user-controlled upstream URL
// before it is persisted. Empty values use a built-in protocol endpoint and
// therefore need no user-input validation.
func ValidatePersonalProviderBaseURL(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return fmt.Errorf("个人供应商 Base URL 无效: %w", err)
	}
	if !parsed.IsAbs() || !strings.EqualFold(parsed.Scheme, "https") {
		return errors.New("个人供应商 Base URL 仅支持 HTTPS")
	}
	if parsed.Host == "" || parsed.Hostname() == "" {
		return errors.New("个人供应商 Base URL 必须包含主机名")
	}
	if parsed.User != nil {
		return errors.New("个人供应商 Base URL 不允许包含用户信息")
	}
	if parsed.Fragment != "" {
		return errors.New("个人供应商 Base URL 不允许包含片段")
	}
	if parsed.RawQuery != "" {
		return errors.New("个人供应商 Base URL 不允许包含查询参数")
	}
	return validatePersonalProviderHost(context.Background(), parsed.Hostname())
}

// DoPersonalProviderRequest performs a request for a user-owned connection.
// It is intentionally not proxied through RELAY_PROXY: a proxy would resolve
// the hostname outside this process and defeat the address-level guard.
func DoPersonalProviderRequest(req *http.Request) (*http.Response, error) {
	if req == nil || req.URL == nil {
		return nil, errors.New("个人供应商请求无效")
	}
	if err := ValidatePersonalProviderBaseURL(req.URL.String()); err != nil {
		return nil, err
	}
	return PersonalProviderHTTPClient.Do(req)
}

func InitPersonalProviderHTTPClient(timeout time.Duration) {
	PersonalProviderHTTPClient = newPersonalProviderHTTPClientWithTimeout(timeout)
}

func newPersonalProviderHTTPClient() *http.Client {
	return newPersonalProviderHTTPClientWithTimeout(0)
}

func newPersonalProviderHTTPClientWithTimeout(timeout time.Duration) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = dialPersonalProviderContext
	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func dialPersonalProviderContext(ctx context.Context, network string, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, fmt.Errorf("个人供应商上游地址无效: %w", err)
	}
	lookupCtx, cancel := context.WithTimeout(ctx, personalProviderHostLookupTimeout)
	defer cancel()
	addresses, err := resolvePersonalProviderPublicAddresses(lookupCtx, host)
	if err != nil {
		return nil, err
	}
	dialer := &net.Dialer{}
	var lastErr error
	for _, addr := range addresses {
		conn, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(addr.String(), port))
		if dialErr == nil {
			return conn, nil
		}
		lastErr = dialErr
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, errors.New("个人供应商上游没有可连接的公有地址")
}

func validatePersonalProviderHost(ctx context.Context, host string) error {
	_, err := resolvePersonalProviderPublicAddresses(ctx, host)
	return err
}

func resolvePersonalProviderPublicAddresses(ctx context.Context, host string) ([]netip.Addr, error) {
	host = strings.TrimSpace(strings.Trim(host, "[]"))
	if host == "" {
		return nil, errors.New("个人供应商 Base URL 主机名为空")
	}
	if strings.EqualFold(host, "localhost") || strings.HasSuffix(strings.ToLower(host), ".localhost") {
		return nil, errors.New("个人供应商 Base URL 不允许使用 localhost")
	}
	if addr, err := netip.ParseAddr(host); err == nil {
		addr = addr.Unmap()
		if isBlockedPersonalProviderAddress(addr) {
			return nil, fmt.Errorf("个人供应商 Base URL 不允许使用内网或保留地址 %q", host)
		}
		return []netip.Addr{addr}, nil
	}
	lookupCtx, cancel := context.WithTimeout(ctx, personalProviderHostLookupTimeout)
	defer cancel()
	ips, err := net.DefaultResolver.LookupIPAddr(lookupCtx, host)
	if err != nil {
		return nil, fmt.Errorf("无法解析个人供应商 Base URL 主机名: %w", err)
	}
	publicAddresses := make([]netip.Addr, 0, len(ips))
	for _, ip := range ips {
		addr, ok := netip.AddrFromSlice(ip.IP)
		if !ok {
			continue
		}
		addr = addr.Unmap()
		if isBlockedPersonalProviderAddress(addr) {
			continue
		}
		publicAddresses = append(publicAddresses, addr)
	}
	if len(publicAddresses) == 0 {
		return nil, fmt.Errorf("个人供应商 Base URL 主机名 %q 未解析到公有地址", host)
	}
	return publicAddresses, nil
}

func isBlockedPersonalProviderAddress(addr netip.Addr) bool {
	addr = addr.Unmap()
	if !addr.IsValid() || addr.IsLoopback() || addr.IsPrivate() || addr.IsMulticast() || addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsUnspecified() {
		return true
	}
	if addr.Is4() {
		value := addr.As4()
		// Carrier-grade NAT and benchmark ranges are not public Internet
		// destinations even though netip.IsPrivate does not classify them so.
		if value[0] == 100 && value[1] >= 64 && value[1] <= 127 {
			return true
		}
		if value[0] == 198 && (value[1] == 18 || value[1] == 19) {
			return true
		}
		if value[0] >= 224 {
			return true
		}
	}
	return false
}
