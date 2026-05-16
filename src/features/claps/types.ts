export type ClapContentType = 'editorial_post' | 'recap_post';

export type ClapResponse = {
  userClaps: number;
  totalClaps: number;
};

export type ClapStatsResponse = {
  totalClaps: number;
  uniqueClappers: number;
  userClaps: number;
};
