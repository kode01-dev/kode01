export type AuthUserLike = {
  id: string;
  email?: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
};

type ListUsersSuccess = {
  data: {
    users?: AuthUserLike[] | null;
  } | null;
  error: null;
};

type ListUsersFailure = {
  data: {
    users?: [];
  } | null;
  error: {
    message: string;
  };
};

type ListUsersResponse = ListUsersSuccess | ListUsersFailure;

type GetUserByIdResponse = {
  data?: {
    user?: AuthUserLike | null;
  } | null;
};

export type AdminUsersAuthClient = {
  auth: {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<ListUsersResponse>;
      getUserById: (uid: string) => Promise<GetUserByIdResponse>;
    };
  };
};

type FetchAuthUsersByIdArgs = {
  admin: AdminUsersAuthClient;
  profileIds: string[];
  listUsersPageSize?: number;
  getUserByIdBatchSize?: number;
};

const DEFAULT_LIST_USERS_PAGE_SIZE = 500;
const DEFAULT_GET_USER_BY_ID_BATCH_SIZE = 25;

async function fetchAuthUsersByIdViaListUsers(args: {
  admin: AdminUsersAuthClient;
  profileIds: string[];
  pageSize: number;
}): Promise<Map<string, AuthUserLike>> {
  const targetIds = new Set(args.profileIds);
  const remainingIds = new Set(args.profileIds);
  const authUsersById = new Map<string, AuthUserLike>();

  for (let page = 1; remainingIds.size > 0; page += 1) {
    const { data, error } = await args.admin.auth.admin.listUsers({
      page,
      perPage: args.pageSize,
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const users = data?.users ?? [];
    for (const user of users) {
      if (!targetIds.has(user.id)) continue;
      authUsersById.set(user.id, user);
      remainingIds.delete(user.id);
    }

    if (users.length < args.pageSize) break;
  }

  return authUsersById;
}

async function fetchAuthUsersByIdViaGetUserById(args: {
  admin: AdminUsersAuthClient;
  profileIds: string[];
  batchSize: number;
}): Promise<Map<string, AuthUserLike>> {
  const authUsersById = new Map<string, AuthUserLike>();

  for (let index = 0; index < args.profileIds.length; index += args.batchSize) {
    const chunkIds = args.profileIds.slice(index, index + args.batchSize);
    const chunkUsers = await Promise.all(
      chunkIds.map(async (profileId) => {
        const { data } = await args.admin.auth.admin.getUserById(profileId);
        return data?.user ?? null;
      }),
    );

    for (const authUser of chunkUsers) {
      if (!authUser) continue;
      authUsersById.set(authUser.id, authUser);
    }
  }

  return authUsersById;
}

export async function fetchAuthUsersById({
  admin,
  profileIds,
  listUsersPageSize = DEFAULT_LIST_USERS_PAGE_SIZE,
  getUserByIdBatchSize = DEFAULT_GET_USER_BY_ID_BATCH_SIZE,
}: FetchAuthUsersByIdArgs): Promise<Map<string, AuthUserLike>> {
  if (profileIds.length === 0) return new Map<string, AuthUserLike>();

  try {
    return await fetchAuthUsersByIdViaListUsers({
      admin,
      profileIds,
      pageSize: listUsersPageSize,
    });
  } catch {
    return fetchAuthUsersByIdViaGetUserById({
      admin,
      profileIds,
      batchSize: getUserByIdBatchSize,
    });
  }
}
