import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { ShoppingCart, Download, FileText } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function PurchasingListPage() {
  const [selectedWork, setSelectedWork] = useState('');
  const [abcFilter, setAbcFilter] = useState('');
  const [listData, setListData] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('all');

  const { data: works = [] } = useQuery({
    queryKey: ['works'],
    queryFn: () => base44.entities.Project.list()
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('generatePurchasingList', {
        workId: selectedWork,
        abcFilter: abcFilter || null
      });
      return response.data;
    },
    onSuccess: (data) => {
      setListData(data);
    }
  });

  const exportPDF = () => {
    if (!listData) return;

    const doc = new jsPDF();
    const work = works.find(w => w.id === selectedWork);

    // Cabeçalho
    doc.setFontSize(16);
    doc.text('LISTA DE COMPRAS', 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Obra: ${work?.nome}`, 14, 25);
    doc.text(`Total de Períodos: ${listData.total_meses}`, 14, 32);
    doc.text(`Data de Geração: ${listData.data_geracao}`, 14, 39);

    // Tabela
    const tableData = listData.itens.map(item => [
      item.abc_class,
      item.descricao,
      item.unidade,
      item.quantidade.toFixed(2),
      `R$ ${item.valor_unitario.toFixed(2)}`,
      `R$ ${(item.quantidade * item.valor_unitario).toFixed(2)}`
    ]);

    doc.autoTable({
      head: [['ABC', 'Descrição', 'Un.', 'Quantidade', 'Valor Unit.', 'Total']],
      body: tableData,
      startY: 50,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] }
    });

    // Totais
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`VALOR TOTAL: R$ ${listData.total_valor.toFixed(2)}`, 14, finalY);

    doc.save(`lista_compras_${selectedWork}.pdf`);
  };

  const exportXLSX = () => {
    if (!listData) return;

    const work = works.find(w => w.id === selectedWork);
    const wsData = [
      ['LISTA DE COMPRAS'],
      [`Obra: ${work?.nome}`],
      [`Total de Períodos: ${listData.total_meses}`],
      [`Data de Geração: ${listData.data_geracao}`],
      [],
      ['ABC', 'Descrição', 'Unidade', 'Quantidade', 'Valor Unitário', 'Total']
    ];

    listData.itens.forEach(item => {
      wsData.push([
        item.abc_class,
        item.descricao,
        item.unidade,
        item.quantidade,
        item.valor_unitario,
        item.quantidade * item.valor_unitario
      ]);
    });

    wsData.push([]);
    wsData.push(['', '', '', '', 'TOTAL:', listData.total_valor]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lista de Compras');
    XLSX.writeFile(wb, `lista_compras_${selectedWork}.xlsx`);
  };

  // Filtrar itens por mês selecionado
  let filteredPeriodos = listData?.periodos || [];
  let displayData = listData;

  if (selectedMonth !== 'all' && listData) {
    const monthNum = parseInt(selectedMonth);
    filteredPeriodos = listData.periodos.filter(p => p.mes === monthNum);
    
    const allItems = filteredPeriodos.flatMap(p => p.itens);
    const totalValue = filteredPeriodos.reduce((sum, p) => sum + p.total_valor, 0);
    displayData = {
      ...listData,
      periodos: filteredPeriodos,
      itens: allItems,
      total_geral_itens: allItems.length,
      total_geral_valor: totalValue
    };
  }

  const abcCounts = displayData?.itens?.reduce((acc, item) => ({
    ...acc,
    [item.abc_class]: (acc[item.abc_class] || 0) + 1
  }), {}) || {};

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Lista de Compras Mensal"
        subtitle="Gere listas de compra baseadas no cronograma e curva ABC"
        icon={ShoppingCart}
      />

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Parâmetros da Lista</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div className="space-y-2">
               <label className="text-sm font-medium">Obra</label>
               <Select value={selectedWork} onValueChange={setSelectedWork}>
                 <SelectTrigger>
                   <SelectValue placeholder="Selecione a obra" />
                 </SelectTrigger>
                 <SelectContent>
                   {works.map(work => (
                     <SelectItem key={work.id} value={work.id}>
                       {work.nome}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>

             <div className="space-y-2">
               <label className="text-sm font-medium">Período</label>
               <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                 <SelectTrigger>
                   <SelectValue placeholder="Todos" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">Todos os Meses</SelectItem>
                   {listData?.periodos?.map(p => (
                     <SelectItem key={p.mes} value={p.mes.toString()}>
                       {p.periodo}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>

             <div className="space-y-2">
               <label className="text-sm font-medium">Filtro ABC</label>
               <Select value={abcFilter} onValueChange={setAbcFilter}>
                 <SelectTrigger>
                   <SelectValue placeholder="Todos" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value={null}>Todos</SelectItem>
                   <SelectItem value="A">Classe A (Alto valor)</SelectItem>
                   <SelectItem value="B">Classe B (Médio valor)</SelectItem>
                   <SelectItem value="C">Classe C (Baixo valor)</SelectItem>
                 </SelectContent>
               </Select>
             </div>
           </div>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!selectedWork || generateMutation.isPending}
            className="mt-4 bg-blue-600 hover:bg-blue-700"
          >
            {generateMutation.isPending ? 'Gerando...' : 'Gerar Lista Completa'}
          </Button>
        </CardContent>
      </Card>

      {/* Resultado */}
      {listData && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">Total de Itens</p>
                <p className="text-2xl font-bold">{listData?.itens?.length || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">Classe A</p>
                <p className="text-2xl font-bold text-red-600">{abcCounts?.A || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">Classe B</p>
                <p className="text-2xl font-bold text-amber-600">{abcCounts?.B || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">Classe C</p>
                <p className="text-2xl font-bold text-green-600">{abcCounts?.C || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">Valor Total</p>
                <p className="text-2xl font-bold">R$ {(listData?.total_valor || 0).toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabela */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Itens para Compra</CardTitle>
                <div className="flex gap-2">
                  <Button
                    onClick={exportPDF}
                    variant="outline"
                    size="sm"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button
                    onClick={exportXLSX}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left py-3 px-4 font-medium">ABC</th>
                      <th className="text-left py-3 px-4 font-medium">Descrição</th>
                      <th className="text-left py-3 px-4 font-medium">Unidade</th>
                      <th className="text-right py-3 px-4 font-medium">Quantidade</th>
                      <th className="text-right py-3 px-4 font-medium">Valor Unit.</th>
                      <th className="text-right py-3 px-4 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(listData?.itens || []).map((item, idx) => (
                      <tr key={idx} className="border-b hover:bg-slate-50 transition">
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-white text-xs font-medium ${
                            item.abc_class === 'A' ? 'bg-red-600' :
                            item.abc_class === 'B' ? 'bg-amber-600' :
                            'bg-green-600'
                          }`}>
                            {item.abc_class}
                          </span>
                        </td>
                        <td className="py-3 px-4">{item.descricao}</td>
                        <td className="py-3 px-4">{item.unidade}</td>
                        <td className="py-3 px-4 text-right">{item.quantidade.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-medium">R$ {item.valor_unitario.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-bold">R$ {(item.quantidade * item.valor_unitario).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}