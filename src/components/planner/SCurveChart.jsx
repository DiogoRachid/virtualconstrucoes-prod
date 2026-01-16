import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Fórmula da Curva S: Y = 1 - (1 - n^u)^s
// s = coeficiente de forma (adotado 2 conforme imagem)
// u = coeficiente logarítmico de inflexão (~1.77 para 50% em 50% do tempo)
// n = período normalizado (mês_atual / duração_total)
const calculateSCurve = (months, s = 2, u = 1.77) => {
  const data = [];
  for (let i = 1; i <= months; i++) {
    const n = i / months;
    const y = 1 - Math.pow(1 - Math.pow(n, u), s);
    data.push(y * 100);
  }
  return data;
};

const calculateIdealCurve = (months) => {
  const data = [];
  for (let i = 1; i <= months; i++) {
    data.push((i / months) * 100);
  }
  return data;
};

const calculateScheduleCurve = (schedule, stages, items, months) => {
  const data = [];
  const totalValue = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  
  for (let monthIdx = 0; monthIdx < months; monthIdx++) {
    let cumulativeValue = 0;
    
    stages.forEach(stage => {
      const stageValue = items
        .filter(item => item.stage_id === stage.id)
        .reduce((sum, item) => sum + (item.subtotal || 0), 0);
      
      const cumulativePercentage = schedule[stage.id]?.percentages
        ?.slice(0, monthIdx + 1)
        .reduce((sum, p) => sum + p, 0) || 0;
      
      cumulativeValue += (stageValue * cumulativePercentage) / 100;
    });
    
    data.push(totalValue > 0 ? (cumulativeValue / totalValue) * 100 : 0);
  }
  
  return data;
};

export default function SCurveChart({ schedule, stages, items, months }) {
  const chartData = useMemo(() => {
    const idealCurve = calculateIdealCurve(months);
    const projectedCurve = calculateSCurve(months, 2, 1.77);
    const scheduleCurve = calculateScheduleCurve(schedule, stages, items, months);
    
    return Array.from({ length: months }).map((_, idx) => ({
      month: `Mês ${idx + 1}`,
      ideal: idealCurve[idx],
      projetada: projectedCurve[idx],
      cronograma: scheduleCurve[idx]
    }));
  }, [schedule, stages, items, months]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Curva S - Análise de Progresso</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis 
                domain={[0, 100]}
                label={{ value: 'Avanço Físico (%)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value) => `${Number(value).toFixed(2)}%`}
                labelStyle={{ color: '#000' }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="ideal" 
                stroke="#94a3b8" 
                strokeWidth={2}
                name="Curva Ideal (Linear)"
                strokeDasharray="5 5"
              />
              <Line 
                type="monotone" 
                dataKey="projetada" 
                stroke="#f59e0b" 
                strokeWidth={2}
                name="Curva S Projetada (Fórmula)"
              />
              <Line 
                type="monotone" 
                dataKey="cronograma" 
                stroke="#3b82f6" 
                strokeWidth={3}
                name="Curva do Cronograma"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-0.5 bg-slate-400" style={{ borderTop: '2px dashed' }}></div>
              <span className="font-medium text-sm">Curva Ideal</span>
            </div>
            <p className="text-xs text-slate-600">Distribuição linear uniforme ao longo do tempo</p>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-0.5 bg-orange-500"></div>
              <span className="font-medium text-sm">Curva S Projetada</span>
            </div>
            <p className="text-xs text-slate-600">Fórmula: Y = 1 - (1-n^u)^s | s=2, u=1.77 (50% em 50% do tempo)</p>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-0.5 bg-blue-600"></div>
              <span className="font-medium text-sm">Curva do Cronograma</span>
            </div>
            <p className="text-xs text-slate-600">Calculada com base nos percentuais mensais definidos</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}