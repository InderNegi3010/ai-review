export const ROLES = {
  ADMIN: "admin",
  CLIENT: "client",
  TEAM_MEMBER: "team_member",
};

export const PERMISSIONS = {
  MANAGE_USERS: "manage_users",
  MANAGE_BUSINESSES: "manage_businesses",
  MANAGE_REVIEWS: "manage_reviews",
  MANAGE_SUBSCRIPTIONS: "manage_subscriptions",
  VIEW_ANALYTICS: "view_analytics",
  MANAGE_TEAM: "manage_team",
  GENERATE_REPORTS: "generate_reports",
};

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [...Object.values(PERMISSIONS)],
  [ROLES.CLIENT]: [
    PERMISSIONS.MANAGE_BUSINESSES,
    PERMISSIONS.MANAGE_REVIEWS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_TEAM,
    PERMISSIONS.GENERATE_REPORTS,
  ],
  [ROLES.TEAM_MEMBER]: [
    PERMISSIONS.MANAGE_REVIEWS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.GENERATE_REPORTS,
  ],
};
