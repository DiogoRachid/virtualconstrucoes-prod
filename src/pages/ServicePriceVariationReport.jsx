import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, Filter, ArrowUpDown } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fetchAll = async (entity) => {
  const limit = 5000;
  let all = [];
  let skip = 0;
  while (true) {
    const batch = await entity.list('created_date', limit, skip);
    all = all.concat(batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  return all;
};

export default function ServicePriceVariationReport() {
  const [dataBaseX, setDataBaseX] = useState('');
  const [dataBaseY, setDataBaseY] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Histórico de snapshots + serviços atuais (mesma abordagem dos insumos)
  const { data: priceHistory = [] } = useQuery({
    queryKey: ['service-price-history'],
    queryFn: () => fetchAll(base44.entities.ServicePriceHistory)
  });

  const { data: allServices = [] } = useQuery({
    queryKey: ['all-services-variation'],
    queryFn: () => fetchAll(base44.entities.Service)
  });

  // Datas base únicas: histórico + serviços atuais
  const datasBaseUnicas = useMemo(() => {
    const fromHistory = priceHistory.map(h => h.data_base).filter(Boolean);
    const fromCurrent = allServices.map(s => s.data_base).filter(Boolean);
    const datas = [...new Set([...fromHistory, ...fromCurrent])];
    return datas.sort((a, b) => {
      const [mesA, anoA] = a.split('/');
      const [mesB, anoB] = b.split('/');
      return parseInt(anoA) - parseInt(anoB) || parseInt(mesA) - parseInt(mesB);
    });
  }, [priceHistory, allServices]);

  // Construir mapa para uma data_base: prioriza histórico, fallback para atual
  const buildMap = (dataBase) => {
    const map = new Map();
    priceHistory.filter(h => h.data_base === dataBase).forEach(h => {
      map.set(h.codigo, { codigo: h.codigo, descricao: h.descricao, unidade: h.unidade, custo_total: h.custo_total, custo_material: h.custo_material, custo_mao_obra: h.custo_mao_obra });
    });
    allServices.filter(s => s.data_base === dataBase).forEach(s => {
      map.set(s.codigo, { codigo: s.codigo, descricao: s.descricao, unidade: s.unidade, custo_total: s.custo_total, custo_material: s.custo_material, custo_mao_obra: s.custo_mao_obra });
    });
    return map;
  };

  const variacoes = useMemo(() => {
    if (!dataBaseX || !dataBaseY) return [];

    const mapX = buildMap(dataBaseX);
    const mapY = buildMap(dataBaseY);

    const resultados = [];
    mapX.forEach((svcX, codigo) => {
      const svcY = mapY.get(codigo);
      if (svcY && svcX.custo_total > 0) {
        const variacao = ((svcY.custo_total - svcX.custo_total) / svcX.custo_total) * 100;
        resultados.push({
          codigo,
          descricao: svcX.descricao,
          unidade: svcX.unidade,
          valorX: svcX.custo_total,
          valorY: svcY.custo_total,
          variacao,
        });
      }
    });

    return resultados;
  }, [dataBaseX, dataBaseY, priceHistory, allServices]);

  const filteredVariacoes = useMemo(() => {
    let filtered = variacoes;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.codigo?.toLowerCase().includes(query) ||
        v.descricao?.toLowerCase().includes(query)
      );
    }

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (typeof aVal === 'string') { aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase(); }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [variacoes, searchQuery, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const formatPercent = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);

  const variacaoClass = (value) => {
    if (value > 0) return 'text-green-600 font-medium';
    if (value < 0) return 'text-red-600 font-medium';
    return 'text-slate-600';
  };

  const VariacaoIcon = ({ value }) => {
    if (value > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (value < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-slate-400" />;
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Relatório de Variação de Preços de Serviços"
        subtitle="Compare o custo total de serviços entre diferentes datas base"
        icon={TrendingUp}
      />

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Data Base X (Inicial)</Label>
              <Select value={dataBaseX} onValueChange={setDataBaseX}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {datasBaseUnicas.map(data => (
                    <SelectItem key={data} value={data}>{data}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data Base Y (Final)</Label>
              <Select value={dataBaseY} onValueChange={setDataBaseY}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {datasBaseUnicas.map(data => (
                    <SelectItem key={data} value={data}>{data}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Buscar Serviço</Label>
              <Input
                placeholder="Código ou descrição..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      {dataBaseX && dataBaseY && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-600">Serviços Comparados</div>
              <div className="text-2xl font-bold">{variacoes.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-600">Variação Média</div>
              <div className={`text-2xl font-bold ${variacoes.length > 0 ? variacaoClass(variacoes.reduce((s, v) => s + v.variacao, 0) / variacoes.length) : ''}`}>
                {variacoes.length > 0 ? formatPercent(variacoes.reduce((s, v) => s + v.variacao, 0) / variacoes.length) : '-'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-600">Maior Variação</div>
              <div className={`text-2xl font-bold ${variacoes.length > 0 ? variacaoClass(Math.max(...variacoes.map(v => v.variacao))) : ''}`}>
                {variacoes.length > 0 ? formatPercent(Math.max(...variacoes.map(v => v.variacao))) : '-'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lista de Serviços — Comparação {dataBaseX || '...'} vs {dataBaseY || '...'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!dataBaseX || !dataBaseY ? (
            <div className="text-center py-8 text-slate-500">
              Selecione ambas as datas base para visualizar a comparação
            </div>
          ) : filteredVariacoes.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nenhum serviço encontrado. Certifique-se de recalcular os serviços após atualizar os insumos para gerar snapshots históricos.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32 cursor-pointer" onClick={() => handleSort('codigo')}>
                      <div className="flex items-center gap-1">Código <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('descricao')}>
                      <div className="flex items-center gap-1">Descrição <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="w-20 text-center cursor-pointer" onClick={() => handleSort('unidade')}>
                      <div className="flex items-center gap-1 justify-center">Un. <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="w-36 text-right cursor-pointer" onClick={() => handleSort('valorX')}>
                      <div className="flex items-center gap-1 justify-end">Custo ({dataBaseX}) <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="w-36 text-right cursor-pointer" onClick={() => handleSort('valorY')}>
                      <div className="flex items-center gap-1 justify-end">Custo ({dataBaseY}) <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="w-32 text-right cursor-pointer" onClick={() => handleSort('variacao')}>
                      <div className="flex items-center gap-1 justify-end">Variação <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVariacoes.map((v) => (
                    <TableRow key={v.codigo}>
                      <TableCell className="font-medium font-mono text-xs">{v.codigo}</TableCell>
                      <TableCell>{v.descricao}</TableCell>
                      <TableCell className="text-center">{v.unidade}</TableCell>
                      <TableCell className="text-right">{formatCurrency(v.valorX)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(v.valorY)}</TableCell>
                      <TableCell className={`text-right ${variacaoClass(v.variacao)}`}>
                        <div className="flex items-center justify-end gap-1">
                          <VariacaoIcon value={v.variacao} />
                          {formatPercent(v.variacao)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}