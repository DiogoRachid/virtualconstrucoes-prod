import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Package, Layers, FileText, FileSpreadsheet } from 'lucide-react';
import { exportToPDF, exportToExcel } from './QuotationMapGenerator';

const COLORS_ABC = {
  A: '#ef4444',
  B: '#f59e0b',
  C: '#10b981'
};

// Função recursiva para buscar todos os insumos de um serviço
const getAllInputsFromService = async (serviceId, services, serviceItems, inputs, multiplier = 1) => {
  const resultInputs = [];
  
  // Buscar itens do serviço (ServiceItem)
  const items = serviceItems.filter(si => si.servico_id === serviceId);
  
  for (const item of items) {
    const itemQuantity = (item.quantidade || 0) * multiplier;
    const itemCost = item.custo_unitario || 0;
    
    if (item.tipo_item === 'INSUMO' && item.item_id) {
      // É um insumo direto
      const input = inputs.find(inp => inp.id === item.item_id);
      if (input) {
        resultInputs.push({
          id: item.item_id,
          code: input.codigo,
          description: input.descricao,
          unit: input.unidade,
          category: item.categoria,
          quantity: itemQuantity,
          unitCost: item.custo_unitario_snapshot || input.valor_unitario || 0,
          value: itemQuantity * (item.custo_unitario_snapshot || input.valor_unitario || 0)
        });
      }
    } else if (item.tipo_item === 'SERVICO' && item.item_id) {
      // É um sub-serviço, buscar recursivamente
      const subInputs = await getAllInputsFromService(item.item_id, services, serviceItems, inputs, itemQuantity);
      resultInputs.push(...subInputs);
    }
  }
  
  return resultInputs;
};

const classifyABC = (items) => {
  // Ordenar por valor decrescente
  const sorted = [...items].sort((a, b) => b.value - a.value);
  
  const totalValue = sorted.reduce((sum, item) => sum + item.value, 0);
  if (totalValue === 0) return sorted.map(item => ({ ...item, classification: 'C', accumulatedPercent: 0, percentOfTotal: 0 }));
  
  let accumulated = 0;
  
  return sorted.map(item => {
    const previousAccumulated = accumulated;
    accumulated += item.value;
    const accumulatedPercent = (accumulated / totalValue) * 100;
    
    // Curva ABC padrão: 
    // Classe A: primeiros itens que somam até 80% do valor total
    // Classe B: próximos itens que somam de 80% até 95% do valor total  
    // Classe C: demais itens que somam de 95% até 100% do valor total
    let classification = 'C';
    if (previousAccumulated < totalValue * 0.80) {
      classification = 'A';
    } else if (previousAccumulated < totalValue * 0.95) {
      classification = 'B';
    }
    
    return {
      ...item,
      classification,
      accumulatedPercent,
      percentOfTotal: (item.value / totalValue) * 100
    };
  });
};

export default function ABCAnalysis({ items, services, budget }) {
  const [inputAnalysisData, setInputAnalysisData] = useState([]);
  const [isLoadingInputs, setIsLoadingInputs] = useState(true);

  // Carregar análise de insumos de forma assíncrona
  useEffect(() => {
    const loadInputAnalysis = async () => {
      setIsLoadingInputs(true);
      try {
        const inputMap = {};
        
        // Carregar ServiceItems e Inputs
        const serviceItems = await base44.entities.ServiceItem.list();
        const allInputs = await base44.entities.Input.list();
        
        for (const budgetItem of items) {
          const service = services.find(s => s.id === budgetItem.servico_id);
          if (!service) continue;
          
          // Buscar todos os insumos recursivamente
          const itemInputs = await getAllInputsFromService(
            budgetItem.servico_id, 
            services, 
            serviceItems, 
            allInputs, 
            budgetItem.quantidade || 0
          );
          
          // Agregar insumos (evitar duplicação)
          itemInputs.forEach(input => {
            const key = `${input.id}_${input.code}`;

            if (!inputMap[key]) {
              inputMap[key] = {
                id: input.id,
                code: input.code,
                description: input.description,
                value: 0,
                quantity: 0,
                unit: input.unit,
                category: input.category
              };
            }

            inputMap[key].value += input.value;
            inputMap[key].quantity += input.quantity;
          });
        }
        
        setInputAnalysisData(classifyABC(Object.values(inputMap)));
      } catch (error) {
        console.error('Erro ao carregar análise de insumos:', error);
        setInputAnalysisData([]);
      } finally {
        setIsLoadingInputs(false);
      }
    };
    
    if (items.length > 0 && services.length > 0) {
      loadInputAnalysis();
    } else {
      setInputAnalysisData([]);
      setIsLoadingInputs(false);
    }
  }, [items, services]);

  const serviceAnalysis = useMemo(() => {
    const serviceMap = {};
    
    items.forEach(item => {
      // Usar custo direto sem BDI
      const custoDirecto = item.custo_direto_total || 0;
      
      if (!serviceMap[item.servico_id]) {
        serviceMap[item.servico_id] = {
          id: item.servico_id,
          code: item.codigo,
          description: item.descricao,
          value: 0,
          quantity: 0,
          unit: item.unidade
        };
      }
      serviceMap[item.servico_id].value += custoDirecto;
      serviceMap[item.servico_id].quantity += item.quantidade || 0;
    });
    
    return classifyABC(Object.values(serviceMap));
  }, [items]);



  const getClassificationStats = (analysis) => {
    const stats = { A: 0, B: 0, C: 0 };
    const totalValue = analysis.reduce((sum, item) => sum + item.value, 0);
    
    analysis.forEach(item => {
      stats[item.classification] += item.value;
    });
    
    return {
      A: { count: analysis.filter(i => i.classification === 'A').length, value: stats.A, percent: (stats.A / totalValue) * 100 },
      B: { count: analysis.filter(i => i.classification === 'B').length, value: stats.B, percent: (stats.B / totalValue) * 100 },
      C: { count: analysis.filter(i => i.classification === 'C').length, value: stats.C, percent: (stats.C / totalValue) * 100 },
      total: totalValue
    };
  };

  const renderAnalysisTable = (analysis, title, showValidation = false) => {
    const stats = getClassificationStats(analysis);
    
    return (
      <div className="space-y-6">
        {showValidation && budget && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Total Custo Direto (Orçamento)</p>
                  <p className="text-lg font-bold text-slate-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budget.total_direto || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Total Soma ABC ({title})</p>
                  <p className="text-lg font-bold text-slate-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.total)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Diferença</p>
                  <p className={`text-lg font-bold ${Math.abs((budget.total_direto || 0) - stats.total) < 1 ? 'text-green-600' : 'text-orange-600'}`}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs((budget.total_direto || 0) - stats.total))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <div className="grid grid-cols-3 gap-4">
          {['A', 'B', 'C'].map(classification => (
            <Card key={classification} className="border-l-4" style={{ borderLeftColor: COLORS_ABC[classification] }}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold" style={{ color: COLORS_ABC[classification] }}>
                  Classe {classification}
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  {stats[classification].count} itens • {stats[classification].percent.toFixed(1)}% do valor
                </div>
                <div className="text-lg font-semibold mt-2">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats[classification].value)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Classe</TableHead>
                    <TableHead className="w-24">Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-20">Unid</TableHead>
                    <TableHead className="text-right w-24">Qtd</TableHead>
                    <TableHead className="text-right w-32">Valor Total</TableHead>
                    <TableHead className="text-right w-24">% Total</TableHead>
                    <TableHead className="text-right w-24">% Acum.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.map((item, idx) => (
                    <TableRow key={idx} className={item.classification === 'A' ? 'bg-red-50' : item.classification === 'B' ? 'bg-orange-50' : 'bg-green-50'}>
                      <TableCell>
                        <span 
                          className="inline-block px-2 py-1 rounded text-xs font-bold text-white"
                          style={{ backgroundColor: COLORS_ABC[item.classification] }}
                        >
                          {item.classification}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.code}</TableCell>
                      <TableCell className="text-sm">{item.description}</TableCell>
                      <TableCell className="text-xs">{item.unit}</TableCell>
                      <TableCell className="text-right text-sm">{item.quantity.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                      </TableCell>
                      <TableCell className="text-right text-sm">{item.percentOfTotal.toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-sm font-medium">{item.accumulatedPercent.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const prepareQuotationData = () => {
    return inputAnalysisData.map(item => ({
      codigo: item.code,
      descricao: item.description,
      unidade: item.unit,
      quantidade_total: item.quantity,
      valor_unitario: item.quantity > 0 ? item.value / item.quantity : 0,
      valor_total: item.value,
      classe: item.classification
    }));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Análise ABC de Custos</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToPDF(prepareQuotationData(), budget)}
              disabled={isLoadingInputs || inputAnalysisData.length === 0}
            >
              <FileText className="h-4 w-4 mr-2" />
              Mapa PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToExcel(prepareQuotationData(), budget)}
              disabled={isLoadingInputs || inputAnalysisData.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Mapa Excel
            </Button>
          </div>
        </CardHeader>
      </Card>
      
    <Tabs defaultValue="services" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="services">
          <Layers className="h-4 w-4 mr-2" />
          Curva ABC - Serviços
        </TabsTrigger>
        <TabsTrigger value="inputs">
          <Package className="h-4 w-4 mr-2" />
          Curva ABC - Insumos
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="services" className="space-y-6">
        {renderAnalysisTable(serviceAnalysis, 'Serviços', true)}
      </TabsContent>
      
      <TabsContent value="inputs" className="space-y-6">
        {isLoadingInputs ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Carregando análise de insumos...</p>
            </div>
          </div>
        ) : inputAnalysisData.length > 0 ? (
        renderAnalysisTable(inputAnalysisData, 'Insumos', true)
        ) : (
          <div className="flex items-center justify-center h-64">
            <p className="text-slate-500">Nenhum insumo encontrado</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
    </div>
  );
}