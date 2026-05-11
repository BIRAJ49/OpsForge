import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useEffect, useState } from 'react'
import { ChartCard } from '../components/ui/ChartCard'
import { resourceUsageData } from '../data/mockData'
import { api, unwrap } from '../services/api'

function axisChart(children) {
  return (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
      <XAxis dataKey="time" />
      <YAxis />
      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
      {children}
    </>
  )
}

export default function Monitoring() {
  const [data, setData] = useState(resourceUsageData)

  useEffect(() => {
    async function loadMonitoring() {
      try {
        const [cpu, memory, requests, errors, latency] = await Promise.all([
          api.get('/monitoring/cpu'),
          api.get('/monitoring/memory'),
          api.get('/monitoring/request-rate'),
          api.get('/monitoring/error-rate'),
          api.get('/monitoring/latency'),
        ])
        const cpuData = unwrap(cpu).data || []
        const memoryData = unwrap(memory).data || []
        const requestData = unwrap(requests).data || []
        const errorData = unwrap(errors).data || []
        const latencyData = unwrap(latency).data || []
        setData(cpuData.map((point, index) => ({
          time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cpu: point.value,
          memory: memoryData[index]?.value || 0,
          requests: requestData[index]?.value || 0,
          errors: errorData[index]?.value || 0,
          latency: latencyData[index]?.value || 0,
          restarts: index % 3,
        })))
      } catch {
        setData(resourceUsageData)
      }
    }
    loadMonitoring()
  }, [])

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard title="CPU Usage" description="Average CPU utilization">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>{axisChart(<Area dataKey="cpu" stroke="#22d3ee" fill="#22d3ee33" />)}</AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Memory Usage" description="Average memory utilization">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>{axisChart(<Area dataKey="memory" stroke="#a78bfa" fill="#a78bfa33" />)}</AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Request Rate" description="Requests per minute">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>{axisChart(<Line dataKey="requests" stroke="#38bdf8" strokeWidth={2} />)}</LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Error Rate" description="Application error percentage">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>{axisChart(<Line dataKey="errors" stroke="#fb7185" strokeWidth={2} />)}</LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="API Latency" description="p95 latency in milliseconds">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>{axisChart(<Line dataKey="latency" stroke="#f59e0b" strokeWidth={2} />)}</LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Pod Restarts" description="Restart count over time">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>{axisChart(<Bar dataKey="restarts" fill="#818cf8" radius={[4, 4, 0, 0]} />)}</BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
