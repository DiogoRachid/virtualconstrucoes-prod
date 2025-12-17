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
    const [saving, setSaving] = useState(false);
    const queryClient = useQueryClient();

    // Identifica se o investimento deve ser atualizado por cotação unitária
    const isQuoteBased = (inv) => {
        if (!inv.quantidade || inv.quantidade <= 0) return false;
        
        const typesToCheck = ['Ação', 'BDR', 'ETF', 'FII', 'Bitcoin', 'Stock', 'REIT', 'Ethereum', 'Altcoin', 'Crypto'];
        const categoriesToCheck = ['renda_variavel_br', 'renda_variavel_int', 'crypto'];
        
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
            const updates = investments.map(async (inv) => {
                const inputVal = parseFloat(values[inv.id]);
                if (isNaN(inputVal)) return null;
                
                let valorAtual, cotacaoAtual;
                
                if (isQuoteBased(inv)) {
                    cotacaoAtual = inputVal;
                    valorAtual = inputVal * inv.quantidade;
                } else {
                    valorAtual = inputVal;
                    // Tenta calcular cotação reversa se houver quantidade
                    cotacaoAtual = inv.quantidade > 0 ? valorAtual / inv.quantidade : (inv.cotacao_atual || 0);
                }

                const valorInvestido = inv.valor_investido || 0;
                const rentabilidadeValor = valorAtual - valorInvestido;
                const rentabilidadePercent = valorInvestido > 0 ? ((valorAtual / valorInvestido) - 1) * 100 : 0;

                return base44.entities.Investment.update(inv.id, {
                    valor_atual: valorAtual,
                    cotacao_atual: cotacaoAtual,
                    rentabilidade_valor: rentabilidadeValor,
                    rentabilidade_percentual: rentabilidadePercent,
                    ultima_atualizacao: new Date().toISOString()
                });
            });

            await Promise.all(updates);
            
            queryClient.invalidateQueries({ queryKey: ['investments'] });
            toast.success('Valores atualizados com sucesso!');
            onOpenChange(false);
        } catch (error) {
            console.error(error);
            toast.error('Erro ao atualizar valores');
        }
        setSaving(false);
    };

    const handleChange = (id, val) => {
        setValues(prev => ({ ...prev, [id]: val }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Atualizar Valores (Manual)</DialogTitle>
                </DialogHeader>
                
                <div className="flex-1 overflow-hidden p-1 border rounded-md mt-2">
                    <div className="grid grid-cols-12 gap-4 font-medium text-sm text-slate-500 bg-slate-50 p-3 border-b">
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
                                    <div key={inv.id} className="grid grid-cols-12 gap-4 items-center text-sm p-3 hover:bg-slate-50">
                                        <div className="col-span-4">
                                            <p className="font-medium truncate">{inv.nome}</p>
                                            <p className="text-xs text-slate-500">{inv.tipo} • {isQuote ? 'Por Cotação' : 'Valor Total'}</p>
                                        </div>
                                        <div className="col-span-2 text-right font-mono text-slate-600">
                                            {inv.quantidade > 0 ? inv.quantidade.toLocaleString('pt-BR') : '-'}
                                        </div>
                                        <div className="col-span-3 text-right text-slate-600">
                                            <span className="text-xs text-slate-400 mr-1">
                                                {isQuote ? 'Unit:' : 'Total:'}
                                            </span>
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentVal || 0)}
                                        </div>
                                        <div className="col-span-3">
                                            <div className="flex flex-col gap-1">
                                                <Input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={values[inv.id] || ''}
                                                    onChange={(e) => handleChange(inv.id, e.target.value)}
                                                    className="h-9 text-right font-medium"
                                                    placeholder={isQuote ? "Cotação Unit." : "Valor Total"}
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