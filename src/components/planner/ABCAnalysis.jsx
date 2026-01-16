import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Package, Layers } from 'lucide-react';

const COLORS_ABC = {
  A: '#ef4444',
  B: '#f59e0b',
  C: '#10b981'
};

// Função recursiva para buscar todos os insumos de um serviço
const getAllInputsFromService = (service, services, multiplier = 1) => {
  const inputs = [];
  
  if (!service || !service.items_snapshot) return inputs;
  
  service.items_snapshot.forEach(item => {
    const itemQuantity = (item.quantidade || 0) * multiplier;
    const itemCost = item.custo_unitario || 0;
    
    if (item.tipo === 'INPUT' || item.categoria === 'MATERIAL' || item.categoria === 'MAO_OBRA') {
      // É um insumo direto
      inputs.push({
        id: item.input_id || item.id,
        code: item.codigo,
        description: item.descricao,
        unit: item.unidade,
        category: item.categoria,
        quantity: itemQuantity,
        unitCost: itemCost,
        value: itemQuantity * itemCost
      });
    } else if (item.tipo === 'SERVICE' && item.servico_id) {
      // É um sub-serviço, buscar recursivamente
      const subService = services.find(s => s.id === item.servico_id);
      if (subService) {
        const subInputs = getAllInputsFromService(subService, services, itemQuantity);
        inputs.push(...subInputs);
      }
    }
  });
  
  return inputs;
};

const classifyABC = (items) => {
  // Ordenar por valor decrescente
  const sorted = [...items].sort((a, b) => b.value - a.value);
  
  let totalValue = sorted.reduce((sum, item) => sum + item.value, 0);
  let accumulated = 0;
  
  return sorted.map(item => {
    accumulated += item.value;
    const accumulatedPercent = (accumulated / totalValue) * 100;
    
    let classification = 'C';
    if (accumulatedPercent <= 80) classification = 'A';
    else if (accumulatedPercent <= 95) classification = 'B';
    
    return {
      ...item,
      classification,
      accumulatedPercent,
      percentOfTotal: (item.value / totalValue) * 100
    };
  });
};

export default function ABCAnalysis({ items, services }) {
  const serviceAnalysis = useMemo(() => {
    const serviceMap = {};
    
    items.forEach(item => {
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
      serviceMap[item.servico_id].value += item.subtotal || 0;
      serviceMap[item.servico_id].quantity += item.quantidade || 0;
    });
    
    return classifyABC(Object.values(serviceMap));
  }, [items]);

  const inputAnalysis = useMemo(() => {
    const inputMap = {};
    
    items.forEach(budgetItem => {
      const service = services.find(s => s.id === budgetItem.servico_id);
      if (!service) return;
      
      // Buscar todos os insumos recursivamente
      const allInputs = getAllInputsFromService(service, services, budgetItem.quantidade || 0);
      
      // Agregar insumos
      allInputs.forEach(input => {
        const key = `${input.code}_${input.description}`;
        
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
    });
    
    return classifyABC(Object.values(inputMap));
  }, [items, services]);

  const getClassificationStats = (analysis) => {
    const stats = { A: 0, B: 0, C: 0 };
    const totalValue = analysis.reduce((sum, item) => sum + item.value, 0);
    
    analysis.forEach(item => {
      stats[item.classification] += item.value;
    });
    
    return {
      A: { count: analysis.filter(i => i.classification === 'A').length, value: stats.A, percent: (stats.A / totalValue) * 100 },
      B: { count: analysis.filter(i => i.classification === 'B').length, value: stats.B, percent: (stats.B / totalValue) * 100 },
      C: { count: analysis.filter(i => i.classification === 'C').length, value: stats.C, percent: (stats.C / totalValue) * 100 }
    };
  };

  const renderAnalysisTable = (analysis, title) => {
    const stats = getClassificationStats(analysis);
    
    return (
      <div className="space-y-6">
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

  return (
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
        {renderAnalysisTable(serviceAnalysis, 'Serviços')}
      </TabsContent>
      
      <TabsContent value="inputs" className="space-y-6">
        {renderAnalysisTable(inputAnalysis, 'Insumos')}
      </TabsContent>
    </Tabs>
  );
}