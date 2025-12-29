import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save, Calculator } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { toast } from "sonner";
import { useQueryClient } from '@tanstack/react-query';

export default function BatchUpdateQuotesDialog({ open, onOpenChange, investments }) {
    const [values, setValues] = useState({});
    const [indicators, setIndicators] = useState({
        dolar: '',
        euro: '',
        ibovespa: ''
    });
    const [saving, setSaving] = useState(false);
    const queryClient = useQueryClient();

    // Carregar indicadores recentes
    useEffect(() => {
        if (open) {
            base44.entities.EconomicIndicators.list('-data_referencia', 1).then(res => {
                if (res && res.length > 0) {
                    setIndicators({
                        dolar: res[0].dolar || '',
                        euro: res[0].euro || '',
                        ibovespa: res[0].ibovespa || ''
                    });
                }
            });
        }
    }, [open]);

    // Identifica se o investimento deve ser atualizado por cotação unitária
    const isQuoteBased = (inv) => {
        if (!inv.quantidade || inv.quantidade <= 0) return false;
        
        // Removido renda_variavel_int - ativos internacionais serão por valor total
        const typesToCheck = ['Ação', 'BDR', 'ETF', 'FII', 'Bitcoin', 'Ethereum', 'Altcoin', 'Crypto'];
        const categoriesToCheck = ['renda_variavel_br', 'crypto'];
        
        return typesToCheck.some(t => inv.tipo?.includes(t)) || categoriesToCheck.includes(inv.categoria);
    };

    useEffect(() => {
        if (open) {
            const initialValues = {};
            investments.forEach(inv => {
                if (isQuoteBased(inv)) {
                    initialValues[inv.id] = inv.cotacao_atual || '';
                } else {
                    initialValues[inv.id] = inv.valor_atual || inv.valor_investido || '';
                }
            });
            setValues(initialValues);
        }
    }, [open, investments]);

    const handleSave = async () => {
        setSaving(true);
        try {
            // Salvar indicadores
            if (indicators.dolar || indicators.euro || indicators.ibovespa) {
                await base44.entities.EconomicIndicators.create({
                    dolar: parseFloat(indicators.dolar) || 0,
                    euro: parseFloat(indicators.euro) || 0,
                    ibovespa: parseFloat(indicators.ibovespa) || 0,
                    data_referencia: new Date().toISOString()
                });
            }

            const updates = investments.map(async (inv) => {
                const inputVal = parseFloat(values[inv.id]);
                if (isNaN(inputVal)) return null;
                
                let valorAtual, cotacaoAtual, valorAtualUSD, cotacaoAtualUSD;
                const isIntl = ['renda_variavel_int'].includes(inv.categoria);
                const dolar = parseFloat(indicators.dolar) || 0;
                
                if (isQuoteBased(inv)) {
                    // Cotação unitária em BRL
                    cotacaoAtual = inputVal;
                    valorAtual = inputVal * inv.quantidade;
                } else {
                    // Valor total em BRL
                    valorAtual = inputVal;
                    // Calcula cotação reversa se houver quantidade
                    cotacaoAtual = inv.quantidade > 0 ? valorAtual / inv.quantidade : (inv.cotacao_atual || 0);
                }

                // Se for internacional e tiver dólar, calcula os valores em USD
                if (isIntl && dolar > 0) {
                    valorAtualUSD = valorAtual / dolar;
                    cotacaoAtualUSD = cotacaoAtual / dolar;
                }

                const valorInvestido = inv.valor_investido || 0;
                const rentabilidadeValor = valorAtual - valorInvestido;
                const rentabilidadePercent = valorInvestido > 0 ? ((valorAtual / valorInvestido) - 1) * 100 : 0;

                const payload = {
                    valor_atual: valorAtual,
                    cotacao_atual: cotacaoAtual,
                    rentabilidade_valor: rentabilidadeValor,
                    rentabilidade_percentual: rentabilidadePercent,
                    ultima_atualizacao: new Date().toISOString()
                };

                if (isIntl && dolar > 0 && valorAtualUSD && cotacaoAtualUSD) {
                    payload.valor_atual_usd = valorAtualUSD;
                    payload.cotacao_atual_usd = cotacaoAtualUSD;
                }

                return base44.entities.Investment.update(inv.id, payload);
            });

            await Promise.all(updates);
            
            queryClient.invalidateQueries({ queryKey: ['investments'] });
            queryClient.invalidateQueries({ queryKey: ['economic_indicators'] }); // Invalida indicadores se houver query
            toast.success('Valores atualizados com sucesso!');
            onOpenChange(false);
        } catch (error) {
            console.error(error);
            toast.error('Erro ao atualizar valores');
        }
        setSaving(false);
    };

    const handleChange = (id, val) => {
        // Permitir vírgula como separador decimal (padrão BR)
        const formattedVal = val.replace(',', '.');
        setValues(prev => ({ ...prev, [id]: formattedVal }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Atualizar Valores (Manual)</DialogTitle>
                </DialogHeader>
                
                {/* Inputs de Indicadores */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg mb-2">
                    <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">Dólar (USD)</label>
                        <Input 
                            type="text"
                            inputMode="decimal"
                            value={indicators.dolar}
                            onChange={(e) => setIndicators(prev => ({...prev, dolar: e.target.value.replace(',', '.')}))}
                            placeholder="0,00 (use vírgula)"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">Euro (EUR)</label>
                        <Input 
                            type="text"
                            inputMode="decimal"
                            value={indicators.euro}
                            onChange={(e) => setIndicators(prev => ({...prev, euro: e.target.value.replace(',', '.')}))}
                            placeholder="0,00 (use vírgula)"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">Ibovespa (Pontos)</label>
                        <Input 
                            type="text"
                            inputMode="decimal"
                            value={indicators.ibovespa}
                            onChange={(e) => setIndicators(prev => ({...prev, ibovespa: e.target.value.replace(',', '.')}))}
                            placeholder="0 (use vírgula)"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-hidden p-1 border rounded-md mt-2">
                    <div className="hidden md:grid grid-cols-12 gap-4 font-medium text-sm text-slate-500 bg-slate-50 p-3 border-b">
                        <div className="col-span-4">Investimento</div>
                        <div className="col-span-2 text-right">Qtd.</div>
                        <div className="col-span-3 text-right">Valor Anterior</div>
                        <div className="col-span-3">Novo Valor</div>
                    </div>
                    <ScrollArea className="h-full">
                        <div className="divide-y">
                            {investments.map(inv => {
                                const isQuote = isQuoteBased(inv);
                                const currentVal = isQuote ? inv.cotacao_atual : inv.valor_atual;
                                const inputVal = parseFloat(values[inv.id]);
                                const calculatedTotal = isQuote && !isNaN(inputVal) ? inputVal * inv.quantidade : null;

                                return (
                                    <div key={inv.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-start md:items-center text-sm p-3 hover:bg-slate-50">
                                        <div className="md:col-span-4">
                                            <p className="font-medium truncate">{inv.nome}</p>
                                            <p className="text-xs text-slate-500">{inv.tipo} • {isQuote ? 'Por Cotação' : 'Valor Total'}</p>
                                        </div>
                                        <div className="md:col-span-2 flex md:block justify-between md:text-right">
                                            <span className="text-xs text-slate-400 md:hidden">Quantidade:</span>
                                            <span className="font-mono text-slate-600">
                                                {inv.quantidade > 0 ? inv.quantidade.toLocaleString('pt-BR') : '-'}
                                            </span>
                                        </div>
                                        <div className="md:col-span-3 flex md:block justify-between md:text-right text-slate-600">
                                            <span className="text-xs text-slate-400">
                                                {isQuote ? 'Unit:' : 'Total:'} Anterior
                                            </span>
                                            <span className="font-medium">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentVal || 0)}
                                            </span>
                                        </div>
                                        <div className="md:col-span-3">
                                            <div className="flex flex-col gap-1">
                                                <Input 
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={values[inv.id] || ''}
                                                    onChange={(e) => handleChange(inv.id, e.target.value)}
                                                    className="h-9 text-right font-medium"
                                                    placeholder={isQuote ? "Cotação Unit. (use vírgula)" : "Valor Total"}
                                                />
                                                {calculatedTotal !== null && (
                                                    <div className="text-xs text-right text-emerald-600 font-medium flex items-center justify-end gap-1">
                                                        <Calculator className="h-3 w-3" />
                                                        Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculatedTotal)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" />
                        Salvar Atualizações
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}