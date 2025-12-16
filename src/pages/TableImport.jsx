import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadCloud, Save, Loader2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';

// PROMPT 5: IMPORTAÇÃO MULTI-PASS
export default function TableImport() {
  const [file, setFile] = useState(null);
  const [type, setType] = useState('INSUMO'); // INSUMO | COMPOSICAO
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setProgress('Lendo arquivo...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n');
        const separator = lines[0].includes(';') ? ';' : ',';

        // Headers: Assume standard:
        // INSUMO: CODIGO, DESCRICAO, UNIDADE, VALOR, FONTE
        // COMPOSICAO: COD_PAI, DESC_PAI, UN_PAI, COD_FILHO, QTD, ORDEM
        
        if (type === 'INSUMO') {
          setProgress('Importando Insumos...');
          let count = 0;
          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(separator);
            if (row.length < 3) continue;
            
            // Map columns (simplified for MVP)
            const [codigo, descricao, unidade, valorStr, fonte] = row.map(s => s?.trim().replace(/"/g, ''));
            if (!codigo) continue;

            let valor = 0;
            if (valorStr) valor = parseFloat(valorStr.replace(',', '.'));

            // Check exist
            const existing = await base44.entities.Input.filter({ codigo }).then(r => r[0]);
            if (existing) {
              await base44.entities.Input.update(existing.id, { valor_unitario: valor, descricao, unidade, fonte: fonte || 'IMP' });
            } else {
              await base44.entities.Input.create({
                codigo, descricao, unidade, valor_unitario: valor, fonte: fonte || 'IMP', data_base: '09/2025'
              });
            }
            count++;
            if (count % 50 === 0) setProgress(`Processados ${count}...`);
          }
          toast.success(`Importação de ${count} insumos concluída.`);
        } 
        else if (type === 'COMPOSICAO') {
          // PROMPT 5: MULTI-PASS
          setProgress('Passo 1: Carregando tabela temporária...');
          const batchId = Date.now().toString();
          const staging = [];
          
          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(separator);
            if (row.length < 4) continue;
            // Expected: COD_PAI, DESC_PAI, UN_PAI, COD_FILHO, QTD
            const [codPai, descPai, unPai, codFilho, qtdStr] = row.map(s => s?.trim().replace(/"/g, ''));
            if (!codPai || !codFilho) continue;

            staging.push({
              batch_id: batchId,
              codigo_pai: codPai,
              descricao_pai: descPai,
              unidade_pai: unPai,
              codigo_item: codFilho,
              quantidade: parseFloat(qtdStr?.replace(',', '.') || 0),
              status: 'pendente'
            });
          }
          
          // Bulk create staging (chunked)
          for (let i=0; i<staging.length; i+=100) {
             await base44.entities.CompositionStaging.bulkCreate(staging.slice(i, i+100));
          }

          setProgress('Passo 2: Criando Serviços Pais...');
          // Get distinct parents
          const uniqueParents = [...new Set(staging.map(s => s.codigo_pai))];
          for (const pCode of uniqueParents) {
             const sample = staging.find(s => s.codigo_pai === pCode);
             const exist = await base44.entities.Service.filter({ codigo: pCode }).then(r => r[0]);
             if (!exist) {
                await base44.entities.Service.create({
                   codigo: pCode,
                   descricao: sample.descricao_pai || `Serviço ${pCode}`,
                   unidade: sample.unidade_pai || 'UN',
                   ativo: true
                });
             }
          }

          setProgress('Passo 3: Vinculando Insumos...');
          // Get all inputs map
          const allInputs = await base44.entities.Input.list();
          const inputMap = new Map(allInputs.map(i => [i.codigo, i.id]));
          const allServices = await base44.entities.Service.list();
          const serviceMap = new Map(allServices.map(s => [s.codigo, s.id]));

          const batchItems = await base44.entities.CompositionStaging.filter({ batch_id: batchId });
          
          for (const item of batchItems) {
             const parentId = serviceMap.get(item.codigo_pai);
             if (!parentId) continue;

             // Try to find child as Input first
             let childType = 'INSUMO';
             let childId = inputMap.get(item.codigo_item);
             
             // If not input, check if it is Service
             if (!childId) {
                childId = serviceMap.get(item.codigo_item);
                childType = 'SERVICO';
             }

             if (childId) {
                // Check if already linked
                const existingLink = await base44.entities.ServiceItem.filter({ servico_id: parentId, item_id: childId }).then(r => r[0]);
                if (!existingLink) {
                   await base44.entities.ServiceItem.create({
                      servico_id: parentId,
                      tipo_item: childType,
                      item_id: childId,
                      quantidade: item.quantidade,
                      categoria: 'MATERIAL', // Default, user can change later or infer from unit
                      ordem: 0,
                      custo_unitario_snapshot: 0,
                      custo_total_item: 0
                   });
                }
             }
          }

          setProgress('Passo 4: Recalculando tudo...');
          // Recalculate all services in batch
          // Ideally sort by dependency level, but for MVP just loop
          for (const s of allServices) {
             await Engine.recalculateService(s.id);
          }

          toast.success('Importação de composições finalizada!');
        }

      } catch (err) {
        console.error(err);
        toast.error('Erro na importação');
      } finally {
        setLoading(false);
        setProgress('');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div>
       <PageHeader title="Importação" subtitle="Insumos e Composições (CSV)" icon={UploadCloud} />
       <Card className="max-w-xl">
         <CardHeader><CardTitle>Arquivo CSV</CardTitle></CardHeader>
         <CardContent className="space-y-4">
           <div>
             <Label>Tipo</Label>
             <Select value={type} onValueChange={setType}>
               <SelectTrigger><SelectValue /></SelectTrigger>
               <SelectContent>
                 <SelectItem value="INSUMO">Insumos</SelectItem>
                 <SelectItem value="COMPOSICAO">Composições</SelectItem>
               </SelectContent>
             </Select>
           </div>
           <div>
             <Label>Arquivo</Label>
             <Input type="file" onChange={e => setFile(e.target.files[0])} />
           </div>
           
           {loading ? (
             <div className="flex items-center gap-2 text-blue-600">
               <Loader2 className="animate-spin" /> {progress}
             </div>
           ) : (
             <Button onClick={handleImport} disabled={!file} className="w-full">
               <Save className="mr-2 h-4 w-4" /> Importar
             </Button>
           )}
         </CardContent>
       </Card>
    </div>
  );
}