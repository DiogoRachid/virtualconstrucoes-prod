import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, Filter, ArrowUpDown } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
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

export default function InputPriceVariationReport() {
  const [dataBaseX, setDataBaseX] = useState('');
  const [dataBaseY, setDataBaseY] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Buscar todas as datas base únicas
  const { data: allInputs = [] } = useQuery({
    queryKey: ['all-inputs-variation'],
    queryFn: () => base44.entities.Input.list()
  });

  const datasBaseUnicas = useMemo(() => {
    const datas = [...new Set(allInputs.map(i => i.data_base).filter(Boolean))];
    return datas.sort((a, b) => {
      const [mesA, anoA] = a.split('/');
      const [mesB, anoB] = b.split('/');
      return parseInt(anoA) - parseInt(anoB) || parseInt(mesA) - parseInt(mesB);
    });
  }, [allInputs]);

  // Buscar insumos com as datas base selecionadas
  const { data: inputsX = [] } = useQuery({
    queryKey: ['inputs-dataBase', dataBaseX],
    queryFn: () => dataBaseX ? base44.entities.Input.filter({ data_base: dataBaseX }) : [],
    enabled: !!dataBaseX
  });

  const { data: inputsY = [] } = useQuery({
    queryKey: ['inputs-dataBase', dataBaseY],
    queryFn: () => dataBaseY ? base44.entities.Input.filter({ data_base: dataBaseY }) : [],
    enabled: !!dataBaseY
  });

  // Calcular variação de preços
  const variacoes = useMemo(() => {
    if (!dataBaseX || !dataBaseY) return [];

    const mapX = new Map(inputsX.map(i => [i.codigo, i]));
    const mapY = new Map(inputsY.map(i => [i.codigo, i]));

    const resultados = [];

    // Insumos que existem em ambas as datas base
    inputsX.forEach(inputX => {
      const inputY = mapY.get(inputX.codigo);
      if (inputY) {
        const variacaoPercentual = ((inputY.valor_unitario - inputX.valor_unitario) / inputX.valor_unitario) * 100;
        resultados.push({
          codigo: inputX.codigo,
          descricao: inputX.descricao,
          unidade: inputX.unidade,
          valorX: inputX.valor_unitario,
          valorY: inputY.valor_unitario,
          variacao: variacaoPercentual,
          categoria: inputX.categoria
        });
      }
    });

    return resultados;
  }, [dataBaseX, dataBaseY, inputsX, inputsY]);

  // Filtrar e ordenar
  const filteredVariacoes = useMemo(() => {
    let filtered = variacoes;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.codigo.toLowerCase().includes(query) ||
        v.descricao.toLowerCase().includes(query)
      );
    }

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatPercent = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value / 100);
  };

  const VariacaoIcon = ({ value }) => {
    if (value > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (value < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-slate-400" />;
  };

  const variacaoClass = (value) => {
    if (value > 0) return 'text-green-600 font-medium';
    if (value < 0) return 'text-red-600 font-medium';
    return 'text-slate-600';
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Relatório de Variação de Preços de Insumos"
        subtitle="Compare preços de insumos entre diferentes datas base"
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
              <Label htmlFor="dataBaseX">Data Base X (Inicial)</Label>
              <Select value={dataBaseX} onValueChange={setDataBaseX}>
                <SelectTrigger id="dataBaseX">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {datasBaseUnicas.map(data => (
                    <SelectItem key={data} value={data}>
                      {data}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dataBaseY">Data Base Y (Final)</Label>
              <Select value={dataBaseY} onValueChange={setDataBaseY}>
                <SelectTrigger id="dataBaseY">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {datasBaseUnicas.map(data => (
                    <SelectItem key={data} value={data}>
                      {data}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="search">Buscar Insumo</Label>
              <Input
                id="search"
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
              <div className="text-sm text-slate-600">Insumos Comparados</div>
              <div className="text-2xl font-bold">{variacoes.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-600">Variação Média</div>
              <div className={`text-2xl font-bold ${
                variacoes.length > 0
                  ? variacaoClass(variacoes.reduce((sum, v) => sum + v.variacao, 0) / variacoes.length)
                  : ''
              }`}>
                {variacoes.length > 0
                  ? formatPercent(variacoes.reduce((sum, v) => sum + v.variacao, 0) / variacoes.length)
                  : '-'
                }
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-600">Maior Variação</div>
              <div className={`text-2xl font-bold ${
                variacoes.length > 0
                  ? variacaoClass(Math.max(...variacoes.map(v => v.variacao)))
                  : ''
              }`}>
                {variacoes.length > 0
                  ? formatPercent(Math.max(...variacoes.map(v => v.variacao)))
                  : '-'
                }
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lista de Insumos - Comparação {dataBaseX || '...'} vs {dataBaseY || '...'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!dataBaseX || !dataBaseY ? (
            <div className="text-center py-8 text-slate-500">
              Selecione ambas as datas base para visualizar a comparação
            </div>
          ) : filteredVariacoes.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nenhum insumo encontrado com os filtros aplicados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32 cursor-pointer" onClick={() => handleSort('codigo')}>
                      <div className="flex items-center gap-1">
                        Código <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('descricao')}>
                      <div className="flex items-center gap-1">
                        Descrição <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="w-24 text-center cursor-pointer" onClick={() => handleSort('unidade')}>
                      <div className="flex items-center gap-1 justify-center">
                        Un. <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="w-32 text-right cursor-pointer" onClick={() => handleSort('valorX')}>
                      <div className="flex items-center gap-1 justify-end">
                        Valor ({dataBaseX}) <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="w-32 text-right cursor-pointer" onClick={() => handleSort('valorY')}>
                      <div className="flex items-center gap-1 justify-end">
                        Valor ({dataBaseY}) <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="w-32 text-right cursor-pointer" onClick={() => handleSort('variacao')}>
                      <div className="flex items-center gap-1 justify-end">
                        Variação <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVariacoes.map((v) => (
                    <TableRow key={v.codigo}>
                      <TableCell className="font-medium">{v.codigo}</TableCell>
                      <TableCell>{v.descricao}</TableCell>
                      <TableCell className="text-center">{v.unidade}</TableCell>
                      <TableCell className="text-right">{formatCurrency(v.valorX)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(v.valorY)}</TableCell>
                      <TableCell className={`text-right flex items-center justify-end gap-1 ${variacaoClass(v.variacao)}`}>
                        <VariacaoIcon value={v.variacao} />
                        {formatPercent(v.variacao)}
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