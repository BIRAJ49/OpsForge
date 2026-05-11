import { Card, CardHeader, CardContent } from './Card'

export function ChartCard({ title, description, action, children, className = '' }) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} action={action} />
      <CardContent className="h-80 min-w-0">{children}</CardContent>
    </Card>
  )
}
