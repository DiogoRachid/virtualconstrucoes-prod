import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

export default function RealizadoTab({ budget, stages, items }) {
  const [distributions, setDistributions] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [measurementItems, setMeasurementItems] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!budget?.id) return;
      setLoading(true);

      const dists = await base44.entities.ServiceMonthlyDistribution.filter({ orcamento_id: budget.id });
      setDistributions(dists);

      const meds = await base44.entities.Measurement.filter({
        obra_id: budget.obra_id,
        orcamento_id: budget.id
      });
      const sortedMeds = meds.sort((a, b) => a.numero_medicao - b.numero_medicao);
      setMeasurements(sortedMeds);

      // Indexar itens pelo numero_medicao
      const itemsMap = {};
      for (const med of sortedMeds) {
        const medItems = await base44.entities.MeasurementItem.filter({ medicao_id: med.id });
        itemsMap[med.numero_medicao] = medItems;
      }
      setMeasurementItems(itemsMap);
      setLoading(false);
    };
    load();
  }, [budget?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const totalMeses = budget?.duracao_meses || 12;
  const maxMedMes = measurements.length > 0 ? Math.max(...measurements.map(m => m.numero_medicao)) : 0;

  // Mapa de distribuição planejada: servico_id + stage_id -> { mes -> percentual }
  const planMap = {};
  distributions.forEach(d => {
    const key = `${d.servico_id}_${d.project_stage_id}`;
    if (!planMap[key]) planMap[key] = {};
    planMap[key][d.mes] = d.percentual || 0;
  });

  const buildItemData = (item) => {
    const key = `${item.servico_id}_${item.stage_id}`;
    const planned = planMap[key] || {};

    const rows = [];
    let carryOver = 0;
    let cumulativeExecuted = 0; // acumulado executado para saber quando atingir 100%

    for (let mes = 1; mes <= totalMeses; mes++) {
      const originalPlanned = planned[mes] || 0;

      // Se já atingiu 100% acumulado, previsto ajustado = 0
      let adjustedPlanned;
      if (cumulativeExecuted >= 100) {
        adjustedPlanned = 0;
      } else {
        const remaining = 100 - cumulativeExecuted;
        adjustedPlanned = Math.max(0, Math.min(remaining, originalPlanned + carryOver));
      }
      carryOver = 0;

      let executed = null;
      if (mes <= maxMedMes) {
        if (cumulativeExecuted >= 100) {
          // Já completou 100%, meses seguintes = 0%
          executed = 0;
        } else {
          // Buscar o item desta medição - primeiro tenta servico_id + stage_id, depois só servico_id
          const medItems = measurementItems[mes] || [];
          let medItem = medItems.find(
            mi => mi.servico_id === item.servico_id && mi.stage_id === item.stage_id
          );
          // Fallback: busca só por servico_id se stage_id não bater
          if (!medItem) {
            medItem = medItems.find(mi => mi.servico_id === item.servico_id);
          }

          if (medItem) {
            const qtdOrcada = item.quantidade || 0;
            const rawPct = qtdOrcada > 0
              ? ((medItem.quantidade_executada_periodo || 0) / qtdOrcada) * 100
              : 0;
            // Cap: não pode ultrapassar o saldo restante
            const remaining = 100 - cumulativeExecuted;
            executed = Math.min(rawPct, remaining);
          } else {
            executed = 0;
          }

          cumulativeExecuted += executed;

          // Carry-over: diferença entre executado e ajustado vai para próximo mês
          // Se executou mais: próximo mês reduz (carryOver negativo)
          // Se executou menos: próximo mês aumenta (carryOver positivo)
          carryOver = -(executed - adjustedPlanned);
        }
      }

      rows.push({ mes, originalPlanned, adjustedPlanned, executed });
    }
    return rows;
  };

  const fmtPct = (val) => {
    if (val === null) return '-';
    if (val === 0) return '0.0%';
    return `${val.toFixed(1)}%`;
  };

  const mainStages = stages.filter(s => !s.parent_stage_id).sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100">
            <th className="px-2 py-2 border text-left" rowSpan="2">Nº</th>
            <th className="px-2 py-2 border text-left" rowSpan="2">Código</th>
            <th className="px-2 py-2 border text-left" rowSpan="2">Descrição</th>
            <th className="px-2 py-2 border text-center" rowSpan="2">Un</th>
            {Array.from({ length: totalMeses }, (_, i) => (
              <th key={i + 1} className="px-2 py-2 border text-center bg-blue-50" colSpan="3">
                Mês {i + 1}
              </th>
            ))}
          </tr>
          <tr className="bg-slate-100">
            {Array.from({ length: totalMeses }, (_, i) => (
              <React.Fragment key={i}>
                <th className="px-1 py-1 border text-center text-xs bg-slate-100 whitespace-nowrap">Previsto</th>
                <th className="px-1 py-1 border text-center text-xs bg-yellow-50 whitespace-nowrap">Aj. Previsto</th>
                <th className="px-1 py-1 border text-center text-xs bg-green-50 whitespace-nowrap">Executado</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {mainStages.map((mainStage, mainIdx) => {
            const mainItems = items.filter(i => i.stage_id === mainStage.id);
            const subStages = stages
              .filter(s => s.parent_stage_id === mainStage.id)
              .sort((a, b) => a.ordem - b.ordem);
            const allSubItems = subStages.flatMap(ss => items.filter(i => i.stage_id === ss.id));
            if (mainItems.length === 0 && allSubItems.length === 0) return null;

            return (
              <React.Fragment key={mainStage.id}>
                <tr className="bg-slate-200 font-semibold">
                  <td colSpan={4 + totalMeses * 3} className="px-2 py-2 border">
                    {mainIdx + 1}. {mainStage.nome}
                  </td>
                </tr>

                {mainItems.map((item, itemIdx) => {
                  const rowData = buildItemData(item);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-2 py-1 border text-slate-500">{mainIdx + 1}.{itemIdx + 1}</td>
                      <td className="px-2 py-1 border">{item.codigo}</td>
                      <td className="px-2 py-1 border">{item.descricao}</td>
                      <td className="px-2 py-1 border text-center">{item.unidade}</td>
                      {rowData.map(({ mes, originalPlanned, adjustedPlanned, executed }) => {
                        const diff = executed !== null ? executed - adjustedPlanned : null;
                        return (
                          <React.Fragment key={mes}>
                            <td className="px-1 py-1 border text-right">{fmtPct(originalPlanned || null)}</td>
                            <td className={`px-1 py-1 border text-right bg-yellow-50 ${adjustedPlanned !== originalPlanned && adjustedPlanned > 0 ? 'font-semibold text-orange-600' : ''}`}>
                              {fmtPct(adjustedPlanned || null)}
                            </td>
                            <td className={`px-1 py-1 border text-right bg-green-50 ${
                              executed === null ? 'text-slate-400' :
                              diff !== null && diff > 0.05 ? 'text-blue-600 font-semibold' :
                              diff !== null && diff < -0.05 ? 'text-red-600 font-semibold' : ''
                            }`}>
                              {fmtPct(executed)}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}

                {subStages.map((subStage, subIdx) => {
                  const subItems = items.filter(i => i.stage_id === subStage.id);
                  if (subItems.length === 0) return null;
                  return (
                    <React.Fragment key={subStage.id}>
                      <tr className="bg-slate-100 font-medium">
                        <td colSpan={4 + totalMeses * 3} className="px-2 py-1 border pl-6">
                          {mainIdx + 1}.{subIdx + 1} {subStage.nome}
                        </td>
                      </tr>
                      {subItems.map((item, itemIdx) => {
                        const rowData = buildItemData(item);
                        return (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-2 py-1 border text-slate-500 pl-8">{mainIdx + 1}.{subIdx + 1}.{itemIdx + 1}</td>
                            <td className="px-2 py-1 border">{item.codigo}</td>
                            <td className="px-2 py-1 border">{item.descricao}</td>
                            <td className="px-2 py-1 border text-center">{item.unidade}</td>
                            {rowData.map(({ mes, originalPlanned, adjustedPlanned, executed }) => {
                              const diff = executed !== null ? executed - adjustedPlanned : null;
                              return (
                                <React.Fragment key={mes}>
                                  <td className="px-1 py-1 border text-right">{fmtPct(originalPlanned || null)}</td>
                                  <td className={`px-1 py-1 border text-right bg-yellow-50 ${adjustedPlanned !== originalPlanned && adjustedPlanned > 0 ? 'font-semibold text-orange-600' : ''}`}>
                                    {fmtPct(adjustedPlanned || null)}
                                  </td>
                                  <td className={`px-1 py-1 border text-right bg-green-50 ${
                                    executed === null ? 'text-slate-400' :
                                    diff !== null && diff > 0.05 ? 'text-blue-600 font-semibold' :
                                    diff !== null && diff < -0.05 ? 'text-red-600 font-semibold' : ''
                                  }`}>
                                    {fmtPct(executed)}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600 p-3 bg-slate-50 rounded-lg">
        <span><span className="inline-block w-3 h-3 bg-white border border-slate-300 mr-1 rounded-sm"></span>Previsto: % original do cronograma</span>
        <span><span className="inline-block w-3 h-3 bg-yellow-100 border border-yellow-300 mr-1 rounded-sm"></span>Aj. Previsto: % ajustado (redistribuição das diferenças)</span>
        <span><span className="inline-block w-3 h-3 bg-green-100 border border-green-300 mr-1 rounded-sm"></span>Executado: % real da medição</span>
        <span className="text-blue-600 font-medium">Azul = acima do previsto</span>
        <span className="text-red-600 font-medium">Vermelho = abaixo do previsto</span>
      </div>
    </div>
  );
}