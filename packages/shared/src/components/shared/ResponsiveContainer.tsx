import { PropsWithChildren } from 'react';

export function ResponsiveContainer({ children }: PropsWithChildren) {
  return <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">{children}</div>;
}
