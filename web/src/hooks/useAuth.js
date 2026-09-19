import { useContext } from 'react';
import { UserContext } from '../context/User';

// Role thresholds — kept in one place so backend and frontend agree.
// role=0  : ordinary user
// role>=10: admin (any flavor)
// role=100: root / can manage users
export const ADMIN_ROLE_THRESHOLD = 10;
export const ROOT_ROLE_THRESHOLD = 100;

// Authoritative admin check: trust the in-memory UserContext (which is
// populated from /api/v1/user/self after login), never localStorage alone.
// localStorage is still readable but a user can mutate it from devtools —
// reading UserContext means the role we display is the role the server
// last told us about.
export const useIsAdmin = () => {
  const [userState] = useContext(UserContext);
  const user = userState?.user;
  if (!user) return false;
  if (user.role === undefined || user.role === null) return false;
  return Number(user.role) >= ADMIN_ROLE_THRESHOLD;
};

export const useCanManageUsers = () => {
  const [userState] = useContext(UserContext);
  const user = userState?.user;
  if (!user) return false;
  if (user.role === undefined || user.role === null) return false;
  if (user.can_manage_users === true) return true;
  return Number(user.role) >= ROOT_ROLE_THRESHOLD;
};

export const useCurrentUser = () => {
  const [userState] = useContext(UserContext);
  return userState?.user;
};