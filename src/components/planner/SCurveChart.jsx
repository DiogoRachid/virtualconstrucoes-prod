import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Tabela de Curva S - valores percentuais acumulados
// Primeira coluna = duração total da obra (meses)
// Primeira linha = mês de execução (1, 2, 3, ...)
// Valores = percentual acumulado (0 a 100%)
const SCURVE_TABLE = {
  1: [100.0],
  2: [52.1, 100.0],
  3: [28.5, 75.2, 100.0],
  4: [18.1, 52.1, 85.1, 100.0],
  5: [12.6, 37.7, 66.3, 90.0, 100.0],
  6: [9.3, 28.5, 52.1, 75.2, 92.9, 100.0],
  7: [7.2, 22.4, 41.8, 62.4, 81.0, 94.7, 100.0],
  8: [5.8, 18.1, 34.2, 52.1, 69.7, 85.1, 95.9, 100.0],
  9: [4.7, 14.9, 28.5, 44.1, 60.1, 75.2, 87.9, 96.7, 100.0],
  10: [4.0, 12.6, 24.2, 37.7, 52.1, 66.3, 79.3, 90.0, 97.3, 100.0],
  11: [3.4, 10.7, 20.8, 32.6, 45.5, 58.7, 71.3, 82.5, 91.7, 97.8, 100.0],
  12: [2.9, 9.3, 18.1, 28.5, 40.1, 52.1, 64.0, 75.2, 85.1, 92.9, 98.1, 100.0],
  13: [2.5, 8.1, 15.9, 25.2, 35.6, 46.5, 57.7, 68.4, 78.4, 87.1, 93.9, 98.4, 100.0],
  14: [2.2, 7.2, 14.1, 22.4, 31.8, 41.8, 52.1, 62.4, 72.1, 81.0, 88.7, 94.7, 98.6, 100.0],
  15: [2.0, 6.4, 12.6, 20.1, 28.5, 37.7, 47.3, 56.9, 66.3, 75.2, 83.2, 90.0, 95.3, 98.8, 100.0],
  16: [1.8, 5.8, 11.3, 18.1, 25.8, 34.2, 43.1, 52.1, 61.1, 69.7, 77.8, 85.1, 91.2, 95.9, 98.9, 100.0],
  17: [1.6, 5.2, 10.2, 16.4, 23.4, 31.2, 39.4, 47.9, 56.4, 64.7, 72.7, 80.1, 86.6, 92.1, 96.3, 99.0, 100.0],
  18: [1.5, 4.7, 9.3, 14.9, 21.4, 28.5, 36.2, 44.1, 52.1, 60.1, 67.9, 75.2, 82.0, 87.9, 92.9, 96.7, 99.1, 100.0],
  19: [1.3, 4.3, 8.5, 13.7, 19.6, 26.2, 33.3, 40.7, 48.3, 55.9, 63.4, 70.6, 77.4, 83.6, 89.1, 93.6, 97.0, 99.2, 100.0],
  20: [1.2, 4.0, 7.8, 12.6, 18.1, 24.2, 30.8, 37.7, 44.9, 52.1, 59.3, 66.3, 73.1, 79.3, 85.1, 90.0, 94.2, 97.3, 99.3, 100.0],
  21: [1.1, 3.6, 7.2, 11.6, 16.7, 22.4, 28.5, 35.0, 41.8, 48.7, 55.6, 62.4, 68.9, 75.2, 81.0, 86.3, 90.9, 94.7, 97.6, 99.4, 100.0],
  22: [1.0, 3.4, 6.7, 10.7, 15.5, 20.8, 26.5, 32.6, 39.0, 45.5, 52.1, 58.7, 65.1, 71.3, 77.1, 82.5, 87.4, 91.7, 95.1, 97.8, 99.4, 100.0],
  23: [1.0, 3.1, 6.2, 10.0, 14.4, 19.4, 24.7, 30.5, 36.5, 42.7, 49.0, 55.3, 61.5, 67.5, 73.3, 78.8, 83.9, 88.4, 92.3, 95.5, 97.9, 99.5, 100.0],
  24: [0.9, 2.9, 5.8, 9.3, 13.4, 18.1, 23.1, 28.5, 34.2, 40.1, 46.1, 52.1, 58.1, 64.0, 69.7, 75.2, 80.3, 85.1, 89.3, 92.9, 95.9, 98.1, 99.5, 100.0],
  25: [0.8, 2.7, 5.4, 8.7, 12.6, 16.9, 21.7, 26.8, 32.1, 37.7, 43.4, 49.2, 55.0, 60.7, 66.3, 71.8, 76.9, 81.7, 86.1, 90.0, 93.4, 96.2, 98.3, 99.6, 100.0],
  26: [0.8, 2.5, 5.0, 8.1, 11.8, 15.9, 20.4, 25.2, 30.3, 35.6, 41.0, 46.5, 52.1, 57.7, 63.1, 68.4, 73.6, 78.4, 82.9, 87.1, 90.7, 93.9, 96.5, 98.4, 99.6, 100.0],
  27: [0.7, 2.4, 4.7, 7.6, 11.1, 14.9, 19.2, 23.7, 28.5, 33.6, 38.8, 44.1, 49.4, 54.8, 60.1, 65.3, 70.4, 75.2, 79.8, 84.0, 87.9, 91.4, 94.3, 96.7, 98.5, 99.6, 100.0],
  28: [0.7, 2.2, 4.4, 7.2, 10.4, 14.1, 18.1, 22.4, 27.0, 31.8, 36.7, 41.8, 46.9, 52.1, 57.3, 62.4, 67.3, 72.1, 76.7, 81.0, 85.1, 88.7, 91.9, 94.7, 96.9, 98.6, 99.6, 100.0],
  29: [0.7, 2.1, 4.2, 6.8, 9.8, 13.3, 17.1, 21.2, 25.5, 30.1, 34.8, 39.7, 44.6, 49.6, 54.6, 59.6, 64.4, 69.2, 73.7, 78.1, 82.2, 86.0, 89.4, 92.4, 95.0, 97.1, 98.7, 99.7, 100.0],
  30: [0.6, 2.0, 4.0, 6.4, 9.3, 12.6, 16.2, 20.1, 24.2, 28.5, 33.1, 37.7, 42.5, 47.3, 52.1, 56.9, 61.7, 66.3, 70.9, 75.2, 79.3, 83.2, 86.8, 90.0, 92.9, 95.3, 97.3, 98.8, 99.7, 100.0],
  31: [0.6, 1.9, 3.7, 6.1, 8.8, 11.9, 15.3, 19.0, 23.0, 27.1, 31.4, 35.9, 40.5, 45.1, 49.8, 54.4, 59.1, 63.7, 68.1, 72.4, 76.6, 80.5, 84.2, 87.6, 90.6, 93.3, 95.6, 97.5, 98.9, 99.7, 100.0],
  32: [0.6, 1.8, 3.6, 5.8, 8.4, 11.3, 14.6, 18.1, 21.8, 25.8, 29.9, 34.2, 38.6, 43.1, 47.6, 52.1, 56.6, 61.1, 65.5, 69.7, 73.9, 77.8, 81.6, 85.1, 88.3, 91.2, 93.7, 95.9, 97.6, 98.9, 99.7, 100.0],
  33: [0.5, 1.7, 3.4, 5.5, 7.9, 10.7, 13.8, 17.2, 20.8, 24.6, 28.5, 32.6, 36.9, 41.2, 45.5, 49.9, 54.3, 58.7, 63.0, 67.2, 71.3, 75.2, 79.0, 82.5, 85.9, 88.9, 91.7, 94.1, 96.1, 97.8, 99.0, 99.7, 100.0],
  34: [0.5, 1.6, 3.2, 5.2, 7.6, 10.2, 13.2, 16.4, 19.8, 23.4, 27.2, 31.2, 35.2, 39.4, 43.6, 47.9, 52.1, 56.4, 60.6, 64.7, 68.8, 72.7, 76.5, 80.1, 83.4, 86.6, 89.5, 92.1, 94.4, 96.3, 97.9, 99.0, 99.8, 100.0],
  35: [0.5, 1.5, 3.1, 5.0, 7.2, 9.7, 12.6, 15.6, 18.9, 22.4, 26.0, 29.8, 33.7, 37.7, 41.8, 45.9, 50.0, 54.2, 58.3, 62.4, 66.3, 70.2, 74.0, 77.6, 81.0, 84.3, 87.3, 90.0, 92.5, 94.7, 96.5, 98.0, 99.1, 99.8, 100.0],
  36: [0.5, 1.5, 2.9, 4.7, 6.9, 9.3, 12.0, 14.9, 18.1, 21.4, 24.9, 28.5, 32.3, 36.2, 40.1, 44.1, 48.1, 52.1, 56.1, 60.1, 64.0, 67.9, 71.6, 75.2, 78.7, 82.0, 85.1, 87.9, 90.5, 92.9, 95.0, 96.7, 98.1, 99.1, 99.8, 100.0],
  37: [0.4, 1.4, 2.8, 4.5, 6.6, 8.9, 11.5, 14.3, 17.3, 20.5, 23.8, 27.3, 31.0, 34.7, 38.5, 42.3, 46.2, 50.2, 54.1, 58.0, 61.8, 65.6, 69.3, 72.9, 76.4, 79.7, 82.8, 85.8, 88.5, 91.0, 93.3, 95.2, 96.9, 98.2, 99.2, 99.8, 100.0],
  38: [0.4, 1.3, 2.7, 4.3, 6.3, 8.5, 11.0, 13.7, 16.6, 19.6, 22.9, 26.2, 29.7, 33.3, 37.0, 40.7, 44.5, 48.3, 52.1, 55.9, 59.7, 63.4, 67.1, 70.6, 74.1, 77.4, 80.6, 83.6, 86.4, 89.1, 91.4, 93.6, 95.5, 97.0, 98.3, 99.2, 99.8, 100.0],
  39: [0.4, 1.3, 2.5, 4.1, 6.0, 8.1, 10.5, 13.1, 15.9, 18.8, 21.9, 25.2, 28.5, 32.0, 35.6, 39.2, 42.8, 46.5, 50.3, 54.0, 57.7, 61.3, 64.9, 68.4, 71.9, 75.2, 78.4, 81.5, 84.4, 87.1, 89.6, 91.9, 93.9, 95.7, 97.2, 98.4, 99.3, 99.8, 100.0],
  40: [0.4, 1.2, 2.4, 4.0, 5.8, 7.8, 10.1, 12.6, 15.2, 18.1, 21.1, 24.2, 27.4, 30.8, 34.2, 37.7, 41.3, 44.9, 48.5, 52.1, 55.7, 59.3, 62.9, 66.3, 69.7, 73.1, 76.3, 79.3, 82.3, 85.1, 87.6, 90.0, 92.2, 94.2, 95.9, 97.3, 98.5, 99.3, 99.8, 100.0],
  41: [0.4, 1.2, 2.3, 3.8, 5.5, 7.5, 9.7, 12.1, 14.6, 17.4, 20.2, 23.3, 26.4, 29.6, 33.0, 36.3, 39.8, 43.3, 46.8, 50.3, 53.9, 57.4, 60.9, 64.3, 67.7, 71.0, 74.2, 77.3, 80.2, 83.0, 85.7, 88.2, 90.5, 92.6, 94.4, 96.1, 97.4, 98.5, 99.3, 99.8, 100.0],
  42: [0.3, 1.1, 2.2, 3.6, 5.3, 7.2, 9.3, 11.6, 14.1, 16.7, 19.5, 22.4, 25.4, 28.5, 31.8, 35.0, 38.4, 41.8, 45.2, 48.7, 52.1, 55.6, 59.0, 62.4, 65.7, 68.9, 72.1, 75.2, 78.2, 81.0, 83.8, 86.3, 88.7, 90.9, 92.9, 94.7, 96.2, 97.6, 98.6, 99.4, 99.8, 100.0],
  43: [0.3, 1.1, 2.2, 3.5, 5.1, 6.9, 8.9, 11.2, 13.5, 16.1, 18.8, 21.6, 24.5, 27.5, 30.6, 33.8, 37.1, 40.4, 43.7, 47.1, 50.4, 53.8, 57.1, 60.5, 63.8, 67.0, 70.1, 73.2, 76.2, 79.1, 81.8, 84.4, 86.9, 89.2, 91.3, 93.2, 94.9, 96.4, 97.7, 98.7, 99.4, 99.8, 100.0],
  44: [0.3, 1.0, 2.1, 3.4, 4.9, 6.7, 8.6, 10.7, 13.0, 15.5, 18.1, 20.8, 23.6, 26.5, 29.6, 32.6, 35.8, 39.0, 42.3, 45.5, 48.8, 52.1, 55.4, 58.7, 61.9, 65.1, 68.2, 71.3, 74.2, 77.1, 79.9, 82.5, 85.1, 87.4, 89.6, 91.7, 93.5, 95.1, 96.6, 97.8, 98.7, 99.4, 99.9, 100.0],
  45: [0.3, 1.0, 2.0, 3.2, 4.7, 6.4, 8.3, 10.3, 12.6, 14.9, 17.4, 20.1, 22.8, 25.6, 28.5, 31.5, 34.6, 37.7, 40.9, 44.1, 47.3, 50.5, 53.7, 56.9, 60.1, 63.2, 66.3, 69.4, 72.3, 75.2, 78.0, 80.7, 83.2, 85.6, 87.9, 90.0, 92.0, 93.8, 95.3, 96.7, 97.9, 98.8, 99.4, 99.9, 100.0],
  46: [0.3, 1.0, 1.9, 3.1, 4.6, 6.2, 8.0, 10.0, 12.1, 14.4, 16.8, 19.4, 22.0, 24.7, 27.6, 30.5, 33.5, 36.5, 39.6, 42.7, 45.8, 49.0, 52.1, 55.3, 58.4, 61.5, 64.5, 67.5, 70.5, 73.3, 76.1, 78.8, 81.4, 83.9, 86.2, 88.4, 90.4, 92.3, 94.0, 95.5, 96.8, 97.9, 98.8, 99.5, 99.9, 100.0],
  47: [0.3, 0.9, 1.9, 3.0, 4.4, 6.0, 7.7, 9.6, 11.7, 13.9, 16.2, 18.7, 21.3, 23.9, 26.7, 29.5, 32.4, 35.3, 38.3, 41.4, 44.4, 47.5, 50.6, 53.7, 56.7, 59.8, 62.8, 65.8, 68.7, 71.5, 74.3, 77.0, 79.6, 82.1, 84.5, 86.7, 88.8, 90.8, 92.6, 94.3, 95.7, 97.0, 98.0, 98.9, 99.5, 99.9, 100.0],
  48: [0.3, 0.9, 1.8, 2.9, 4.2, 5.8, 7.4, 9.3, 11.3, 13.4, 15.7, 18.1, 20.6, 23.1, 25.8, 28.5, 31.3, 34.2, 37.1, 40.1, 43.1, 46.1, 49.1, 52.1, 55.1, 58.1, 61.1, 64.0, 66.9, 69.7, 72.5, 75.2, 77.8, 80.3, 82.8, 85.1, 87.2, 89.3, 91.2, 92.9, 94.5, 95.9, 97.1, 98.1, 98.9, 99.5, 99.9, 100.0],
  49: [0.3, 0.9, 1.7, 2.8, 4.1, 5.6, 7.2, 9.0, 10.9, 13.0, 15.2, 17.5, 19.9, 22.4, 25.0, 27.6, 30.4, 33.2, 36.0, 38.9, 41.8, 44.7, 47.7, 50.6, 53.6, 56.5, 59.5, 62.4, 65.2, 68.0, 70.8, 73.5, 76.1, 78.6, 81.0, 83.4, 85.6, 87.7, 89.7, 91.5, 93.2, 94.7, 96.0, 97.2, 98.2, 99.0, 99.5, 99.9, 100.0],
  50: [0.3, 0.8, 1.7, 2.7, 4.0, 5.4, 7.0, 8.7, 10.6, 12.6, 14.7, 16.9, 19.3, 21.7, 24.2, 26.8, 29.4, 32.1, 34.9, 37.7, 40.6, 43.4, 46.3, 49.2, 52.1, 55.0, 57.9, 60.7, 63.6, 66.3, 69.1, 71.8, 74.4, 76.9, 79.3, 81.7, 84.0, 86.1, 88.1, 90.0, 91.8, 93.4, 94.9, 96.2, 97.3, 98.3, 99.0, 99.6, 99.9, 100.0]
};

// Função para buscar valores da tabela com interpolação para durações não tabeladas
const calculateSCurve = (months) => {
  // Se temos valor exato na tabela, usar
  if (SCURVE_TABLE[months]) {
    return SCURVE_TABLE[months];
  }
  
  // Se excede tabela, usar o maior disponível (50 meses)
  if (months > 50) {
    const base = SCURVE_TABLE[50];
    const extended = [...base];
    // Extender mantendo 100% nos meses extras
    for (let i = base.length; i < months; i++) {
      extended.push(100.0);
    }
    return extended;
  }
  
  // Interpolar entre valores tabelados mais próximos
  const keys = Object.keys(SCURVE_TABLE).map(Number).sort((a, b) => a - b);
  const lower = keys.reverse().find(k => k < months);
  const upper = keys.find(k => k > months);
  
  if (!lower || !upper) {
    // Fallback para linear
    return Array.from({ length: months }, (_, i) => ((i + 1) / months) * 100);
  }
  
  // Interpolação linear entre lower e upper
  const lowerData = SCURVE_TABLE[lower];
  const upperData = SCURVE_TABLE[upper];
  const ratio = (months - lower) / (upper - lower);
  
  const result = [];
  for (let i = 0; i < months; i++) {
    const lowerIdx = Math.floor((i / months) * lowerData.length);
    const upperIdx = Math.floor((i / months) * upperData.length);
    const interpolated = lowerData[lowerIdx] + (upperData[upperIdx] - lowerData[lowerIdx]) * ratio;
    result.push(interpolated);
  }
  
  return result;
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
    const projectedCurve = calculateSCurve(months);
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
            <p className="text-xs text-slate-600">Baseada em tabela de referência técnica de engenharia</p>
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