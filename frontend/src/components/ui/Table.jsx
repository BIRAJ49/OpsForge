export function Table({ columns, data, emptyMessage = 'No records found', tableClassName = '' }) {
  return (
    <div className="rounded-lg border border-slate-800">
      <div className="divide-y divide-slate-800 md:hidden">
        {data.length ? (
          data.map((row, rowIndex) => (
            <article key={row.id || row.name || rowIndex} className="space-y-3 bg-slate-900/40 p-4">
              {columns.map((column) => (
                <div key={column.key} className="grid gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{column.header}</p>
                  <div className="min-w-0 text-sm text-slate-300">
                    {column.render ? column.render(row) : row[column.key]}
                  </div>
                </div>
              ))}
            </article>
          ))
        ) : (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            {emptyMessage}
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto custom-scrollbar md:block">
        <table className={`w-max min-w-full divide-y divide-slate-800 text-left text-sm ${tableClassName}`}>
          <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`px-4 py-3 font-semibold ${column.headerClassName || 'whitespace-nowrap'}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {data.length ? (
              data.map((row, rowIndex) => (
                <tr key={row.id || row.name || rowIndex} className="hover:bg-slate-800/40">
                  {columns.map((column) => (
                    <td key={column.key} className={`px-4 py-3 text-slate-300 ${column.className || 'whitespace-nowrap'}`}>
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-10 text-center text-slate-500" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
