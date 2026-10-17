// v0.5: remote MySQL access — clone a local user's credentials and grants to
// an additional host so the user can connect from other machines.
// See docs/api.md section 1.13.
package mysql

import (
	"context"

	"clouddeck/agent/internal/apierr"
)

// RemoteHosts lists every user@host grant whose host is not local.
func (s *Service) RemoteHosts(ctx context.Context) ([]User, error) {
	return nil, apierr.Internal("mysql: not implemented")
}

// AddRemoteHost creates user@host with the same authentication hash as
// user@localhost and copies its grants. The user must exist on localhost.
func (s *Service) AddRemoteHost(ctx context.Context, rawUser, rawHost string) (User, error) {
	return User{}, apierr.Internal("mysql: not implemented")
}

// DeleteRemoteHost drops user@host; localhost entries cannot be dropped.
func (s *Service) DeleteRemoteHost(ctx context.Context, rawUser, rawHost string) (User, error) {
	return User{}, apierr.Internal("mysql: not implemented")
}
