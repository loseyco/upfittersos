import { useState, useMemo } from 'react';
import { cn } from '../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  TrendingUp, DollarSign, Briefcase, 
  Car, ShoppingCart, ArrowUpRight, ArrowDownRight,
  BarChart3, PieChart, Activity, Printer, FileText, ChevronRight
} from 'lucide-react';
import { EfficiencyReports } from './EfficiencyReports';

type Timeframe = 'day' | 'week' | 'month' | 'year';

interface ReportsManagerProps {
  tenantId: string;
}

export function ReportsManager({ tenantId }: ReportsManagerProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('month');
  const [showSummary, setShowSummary] = useState(false);
  const [reportType] = useState<'financial' | 'efficiency'>('efficiency');

  // Fetch all necessary data for reporting
  const { data: reportsData, isLoading } = useQuery({
    queryKey: ['business-reports', tenantId],
    queryFn: async () => {
      const collections = [
        { name: 'qb_invoices', dateField: 'txnDate' },
        { name: 'jobs', dateField: 'createdAt' },
        { name: 'vehicles', dateField: 'createdAt' },
        { name: 'qb_purchase_orders', dateField: 'txnDate' }
      ];

      const results = await Promise.all(
        collections.map(async (col) => {
          try {
            const q = query(
              collection(db, `businesses/${tenantId}/${col.name}`),
              orderBy(col.dateField, 'desc')
            );
            const snap = await getDocs(q);
            return { 
              name: col.name, 
              data: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) 
            };
          } catch (e) {
            console.warn(`Could not fetch ${col.name}`, e);
            return { name: col.name, data: [] };
          }
        })
      );

      return results.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.data }), {} as Record<string, any[]>);
    }
  });

  const metrics = useMemo(() => {
    if (!reportsData) return null;

    const now = new Date();
    const getPeriodStart = (tf: Timeframe, offset = 0) => {
      const d = new Date(now);
      if (tf === 'day') d.setDate(d.getDate() - offset);
      else if (tf === 'week') d.setDate(d.getDate() - (7 * offset));
      else if (tf === 'month') d.setMonth(d.getMonth() - offset);
      else if (tf === 'year') d.setFullYear(d.getFullYear() - offset);
      
      // Reset time to start of period
      if (tf === 'day') d.setHours(0, 0, 0, 0);
      else if (tf === 'week') {
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
      } else if (tf === 'month') {
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
      } else if (tf === 'year') { 
        d.setMonth(0); 
        d.setDate(1); 
        d.setHours(0, 0, 0, 0);
      }
      
      return d.getTime();
    };

    const currentStart = getPeriodStart(timeframe);
    const prevStart = getPeriodStart(timeframe, 1);

    const parseDate = (val: any) => {
      if (!val) return 0;
      if (val.seconds) return val.seconds * 1000;
      return new Date(val).getTime();
    };

    const calculateTotal = (data: any[], field: string, start: number, end: number) => {
      return data
        .filter(item => {
          const ts = parseDate(item.txnDate || item.createdAt || item.updatedAt);
          return ts >= start && ts < end;
        })
        .reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
    };

    const calculateCount = (data: any[], start: number, end: number) => {
      return data.filter(item => {
        const ts = parseDate(item.txnDate || item.createdAt || item.updatedAt);
        return ts >= start && ts < end;
      }).length;
    };

    const getTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const revCurrent = calculateTotal(reportsData.qb_invoices || [], 'totalAmount', currentStart, now.getTime());
    const revPrev = calculateTotal(reportsData.qb_invoices || [], 'totalAmount', prevStart, currentStart);

    const spendCurrent = calculateTotal(reportsData.qb_purchase_orders || [], 'totalAmount', currentStart, now.getTime());
    const spendPrev = calculateTotal(reportsData.qb_purchase_orders || [], 'totalAmount', prevStart, currentStart);

    const jobsCurrent = calculateCount(reportsData.jobs || [], currentStart, now.getTime());
    const jobsPrev = calculateCount(reportsData.jobs || [], prevStart, currentStart);

    const vehiclesCurrent = calculateCount(reportsData.vehicles || [], currentStart, now.getTime());
    const vehiclesPrev = calculateCount(reportsData.vehicles || [], prevStart, currentStart);

    return {
      revenue: { val: revCurrent, trend: getTrend(revCurrent, revPrev) },
      spend: { val: spendCurrent, trend: getTrend(spendCurrent, spendPrev) },
      jobs: { val: jobsCurrent, trend: getTrend(jobsCurrent, jobsPrev) },
      vehicles: { val: vehiclesCurrent, trend: getTrend(vehiclesCurrent, vehiclesPrev) },
      chartData: [1,2,3,4,5,6].map(m => {
        const s = getPeriodStart(timeframe, m);
        const e = getPeriodStart(timeframe, m - 1);
        return {
          label: `-${m}${timeframe[0]}`,
          revenue: calculateTotal(reportsData.qb_invoices || [], 'totalAmount', s, e),
          jobs: calculateCount(reportsData.jobs || [], s, e)
        };
      }).reverse()
    };
  }, [reportsData, timeframe]);

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 animate-pulse">
        <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center">
          <Activity className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
        <p className="text-zinc-500 font-medium">Analyzing business data...</p>
      </div>
    );
  }

  const kpis = [
    { label: 'Total Revenue', value: `$${metrics?.revenue.val.toLocaleString()}`, trend: metrics?.revenue.trend || 0, icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Jobs Created', value: metrics?.jobs.val || 0, trend: metrics?.jobs.trend || 0, icon: Briefcase, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Vehicle Intakes', value: metrics?.vehicles.val || 0, trend: metrics?.vehicles.trend || 0, icon: Car, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { label: 'Purchase Spend', value: `$${metrics?.spend.val.toLocaleString()}`, trend: metrics?.spend.trend || 0, icon: ShoppingCart, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            Performance Analytics
          </h2>
          <p className="text-sm text-zinc-500 mt-1">Real-time business intelligence and growth tracking</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            {(['day', 'week', 'month', 'year'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                  timeframe === tf 
                    ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {reportType === 'financial' && (
            <button 
              onClick={() => setShowSummary(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
            >
              <FileText className="w-4 h-4" />
              Executive Summary
            </button>
          )}
        </div>
      </div>

      {showSummary && metrics && reportType === 'financial' && (
        <ExecutiveSummaryModal 
          tenantId={tenantId} 
          metrics={metrics} 
          timeframe={timeframe}
          onClose={() => setShowSummary(false)} 
        />
      )}

      {reportType === 'efficiency' ? (
        <EfficiencyReports tenantId={tenantId} timeframe={timeframe} />
      ) : (
        <>
          {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${kpi.bg}`}>
                <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-bold ${kpi.trend >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {kpi.trend >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {Math.abs(kpi.trend).toFixed(1)}%
              </div>
            </div>
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{kpi.label}</h3>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">{kpi.value}</p>
            <div className="mt-4 w-full bg-zinc-100 dark:bg-zinc-800 h-1 rounded-full overflow-hidden">
              <div 
                className={`h-full ${kpi.color.replace('text-', 'bg-')} transition-all duration-1000`} 
                style={{ width: `${Math.min(Math.abs(kpi.trend) + 20, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 rounded-3xl shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-white">Revenue Growth</h3>
              <p className="text-xs text-zinc-500">Last 7 periods trend</p>
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>

          <div className="h-64 flex items-end justify-between gap-2 px-2">
            {metrics?.chartData.map((d: any, i: number) => {
              const maxRev = Math.max(...metrics.chartData.map((cd: any) => cd.revenue)) || 1;
              const height = (d.revenue / maxRev) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                  <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap z-10">
                    ${d.revenue.toLocaleString()}
                  </div>
                  <div 
                    className="w-full bg-indigo-500/10 hover:bg-indigo-500/30 rounded-t-lg transition-all duration-500 relative overflow-hidden"
                    style={{ height: `${Math.max(height, 5)}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-indigo-600 to-indigo-400 opacity-80" />
                  </div>
                  <span className="text-[10px] font-bold text-zinc-400 mt-3 uppercase tracking-tighter">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Efficiency Card */}
        <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          
          <div className="relative">
            <PieChart className="w-10 h-10 mb-6 opacity-80" />
            <h3 className="text-xl font-bold mb-2">Efficiency Index</h3>
              <p className="text-indigo-100 text-sm leading-relaxed">
                Based on your {timeframe}ly data, your operational throughput is 
                <span className="font-bold text-white"> {(metrics?.revenue.trend || 0) >= 0 ? 'increasing' : 'stabilizing'}</span>.
              </p>
          </div>

          <div className="relative mt-12 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-indigo-200">
                <span>Job Density</span>
                <span>{metrics?.jobs.val} Units</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full" style={{ width: '65%' }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-indigo-200">
                <span>Vehicle Turnover</span>
                <span>{metrics?.vehicles.val} Intakes</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full" style={{ width: '45%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Grid */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900 dark:text-white">Summary of Operations</h3>
          <button className="text-xs font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-widest">Export CSV</button>
        </div>
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest">
              <tr>
                <th className="px-8 py-4">Period</th>
                <th className="px-8 py-4">Revenue</th>
                <th className="px-8 py-4">Job Volume</th>
                <th className="px-8 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {metrics?.chartData.slice().reverse().map((d: any, i: number) => (
                <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                  <td className="px-8 py-4 font-bold text-zinc-900 dark:text-white">{d.label}</td>
                  <td className="px-8 py-4 font-mono text-zinc-600 dark:text-zinc-400">${d.revenue.toLocaleString()}</td>
                  <td className="px-8 py-4 text-zinc-600 dark:text-zinc-400">{d.jobs} New Jobs</td>
                  <td className="px-8 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${d.revenue > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                      {d.revenue > 0 ? 'ACTIVE' : 'IDLE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

function ExecutiveSummaryModal({ metrics, timeframe, onClose }: any) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-zinc-950 w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[2rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800 print:shadow-none print:border-none print:rounded-none print:max-h-none print:p-0">
        {/* Modal Header - Hidden on Print */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between print:hidden">
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Executive Business Summary</h3>
            <p className="text-sm text-zinc-500">Ready for review or printing</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-bold shadow-sm hover:scale-105 transition-transform"
            >
              <Printer className="w-4 h-4" /> Print Report
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <ChevronRight className="w-6 h-6 rotate-90 sm:rotate-0" />
            </button>
          </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar print:p-0 print:overflow-visible">
          <div className="max-w-2xl mx-auto space-y-12">
            {/* Report Header */}
            <div className="flex items-end justify-between border-b-2 border-zinc-900 dark:border-white pb-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-black text-xl tracking-tighter uppercase">UpfittersOS</span>
                </div>
                <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-white uppercase italic">
                  Operational <br/>Audit Report
                </h1>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Period Ending</p>
                <p className="font-mono text-lg font-bold">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mt-1">{timeframe}ly Review</p>
              </div>
            </div>

            {/* KPI Section */}
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Gross Revenue Generated</p>
                <p className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white italic">
                  ${metrics.revenue.val.toLocaleString()}
                </p>
                <div className={cn("flex items-center gap-1 text-xs font-bold", metrics.revenue.trend >= 0 ? "text-emerald-500" : "text-rose-500")}>
                  {metrics.revenue.trend >= 0 ? "+" : ""}{metrics.revenue.trend.toFixed(1)}% Performance Variance
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Net Operational Volume</p>
                <p className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white italic">
                  {metrics.jobs.val} Active Units
                </p>
                <div className="text-xs font-bold text-zinc-500">
                  Across all service bays and parking zones
                </div>
              </div>
            </div>

            {/* Executive Analysis */}
            <div className="space-y-4 p-8 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800">
              <h4 className="font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" /> Executive Summary
              </h4>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 font-medium">
                Operational metrics indicate a <span className="text-zinc-900 dark:text-white font-bold">{metrics.revenue.trend >= 0 ? 'positive' : 'monitored'} trajectory</span> for the current {timeframe}. 
                Job throughput remains consistent with vehicle intake volumes. Resource allocation in service bays is currently 
                optimized for the reported workload.
              </p>
            </div>

            {/* Table Section */}
            <div className="space-y-4">
              <h4 className="font-black text-xs uppercase tracking-widest">Period-over-Period Performance</h4>
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-6 py-4 font-black uppercase">Historical Period</th>
                      <th className="px-6 py-4 font-black uppercase">Revenue Output</th>
                      <th className="px-6 py-4 font-black uppercase">Job Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {metrics.chartData.slice().reverse().map((d: any, i: number) => (
                      <tr key={i}>
                        <td className="px-6 py-4 font-bold">{d.label}</td>
                        <td className="px-6 py-4 font-mono font-bold">${d.revenue.toLocaleString()}</td>
                        <td className="px-6 py-4">{d.jobs} New Units</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-12 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between opacity-50">
              <p className="text-[10px] font-bold uppercase tracking-widest">Confidential Operational Audit</p>
              <p className="text-[10px] font-mono">ID: {Math.random().toString(36).substring(7).toUpperCase()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
