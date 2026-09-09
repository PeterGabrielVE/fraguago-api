export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Delegate mínimo. Usamos Promise<any> en count/findMany porque el
// cliente extendido de Prisma ($extends) devuelve tipos como
// `number | {}` que no encajan con Promise<number> estricto.
interface PrismaModelDelegate {
  count: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any>;
}

interface PaginateArgs {
  where?: any;
  orderBy?: any;
  include?: any;
  select?: any;
  page?: number;
  pageSize?: number;
}

export async function paginate<T = any>(
  model: PrismaModelDelegate,
  { where, orderBy, include, select, page = 1, pageSize = 20 }: PaginateArgs,
): Promise<PaginatedResult<T>> {
  const [total, data] = await Promise.all([
    model.count({ where }),
    model.findMany({
      where,
      orderBy,
      ...(include ? { include } : {}),
      ...(select ? { select } : {}),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: data as T[],
    total: Number(total),   // normaliza el `number | {}` a number real
    page,
    pageSize,
    totalPages: Math.ceil(Number(total) / pageSize),
  };
}