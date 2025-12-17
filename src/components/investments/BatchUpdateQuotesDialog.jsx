import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { toast } from "sonner";
import { useQueryClient } from '@tanstack/react-query';

export default function BatchUpdateQuotesDialog({ open, onOpenChange, investments }) {
    const [values, setValues] = useState({});
    const [saving, setSaving] = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        if (open) {
            const initialValues = {};
            investments.forEach(inv => {
                // Pre-fill with current value
                initialValues[inv.id] = inv.valor_atual || inv.valor_investido || '';
            });
            setValues(initialValues);
        }
    }, [open, investments]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const updates = investments.map(async (inv) => {
                const newVal = parseFloat(values[inv.id]);
                if (isNaN(newVal)) return null;
                
                // If value hasn't changed, skip update (optional, but good for performance)
                // However, user might want to confirm value even if unchanged to update timestamp
                
                const valorAtual = newVal;
                const valorInvestido = inv.valor_investido || 0;
                const rentabilidadeValor = valorAtual - valorInvestido;
                const rentabilidadePercent = valorInvestido > 0 ? ((valorAtual / valorInvestido) - 1) * 100 : 0;
                
                // Recalculate unit quote if quantity exists
                let cotacaoAtual = inv.cotacao_atual;
                if (inv.quantidade > 0) {
                    cotacaoAtual = valorAtual / inv.quantidade;
                }

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
            <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Atualizar Valores Atuais (Manual)</DialogTitle>
                </DialogHeader>
                
                <div className="flex-1 overflow-hidden p-1 border rounded-md mt-2">
                    <div className="grid grid-cols-12 gap-4 font-medium text-sm text-slate-500 bg-slate-50 p-3 border-b">
                        <div className="col-span-5">Investimento</div>
                        <div className="col-span-3 text-right">Valor Anterior</div>
                        <div className="col-span-4">Novo Valor Total (R$)</div>
                    </div>
                    <ScrollArea className="h-full">
                        <div className="divide-y">
                            {investments.map(inv => (
                                <div key={inv.id} className="grid grid-cols-12 gap-4 items-center text-sm p-3 hover:bg-slate-50">
                                    <div className="col-span-5">
                                        <p className="font-medium truncate">{inv.nome}</p>
                                        <p className="text-xs text-slate-500">{inv.categoria} • {inv.ticker || inv.tipo}</p>
                                    </div>
                                    <div className="col-span-3 text-right text-slate-600">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inv.valor_atual || 0)}
                                    </div>
                                    <div className="col-span-4">
                                        <Input 
                                            type="number" 
                                            step="0.01"
                                            value={values[inv.id] || ''}
                                            onChange={(e) => handleChange(inv.id, e.target.value)}
                                            className="h-9 text-right font-medium"
                                            placeholder="0,00"
                                        />
                                    </div>
                                </div>
                            ))}
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