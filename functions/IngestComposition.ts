import { base44 } from '@base44/backend-sdk';

export default async function IngestComposition({ textData, fileUrl, encoding = 'utf-8', mode, batchId, hasCategoryColumn }) {
    let content = textData;
    
    if (fileUrl) {
        try {
            const res = await fetch(fileUrl);
            if (!res.ok) throw new Error("Failed to fetch file from URL");
            
            const buffer = await res.arrayBuffer();
            const decoder = new TextDecoder(encoding);
            content = decoder.decode(buffer);
        } catch (e) {
            return { success: false, message: "Error downloading file: " + e.message };
        }
    }

    if (!content) return { success: false, message: "No data provided" };

    const lines = content.split('\n');
    const separator = lines[0].includes(';') ? ';' : '\t';
    const stagingItems = [];
    
    // Skip empty lines
    const validLines = lines.filter(l => l.trim());
    
    if (mode === 'INSUMO') {
        // Direct Input Processing
        for (const line of validLines) {
            const cols = line.split(separator).map(c => c?.trim().replace(/"/g, ''));
            if (cols.length < 3) continue;

            const codigo = cols[0];
            const descricao = cols[1];
            const unidade = cols[2];
            const valorStr = cols[3];
            
            let categoria = 'MATERIAL';
            let dataBase = '09/2025';

            if (hasCategoryColumn) {
                const catRaw = (cols[4] || '').toUpperCase().trim();
                if (catRaw.startsWith('MAO') || catRaw.startsWith('MÃO')) categoria = 'MAO_OBRA';
                else if (catRaw.startsWith('MAT')) categoria = 'MATERIAL';
                dataBase = cols[5] || '09/2025';
            } else {
                dataBase = cols[4] || '09/2025';
            }

            if (!codigo) continue;
            const valor = valorStr ? parseFloat(valorStr.replace('R$', '').replace('.', '').replace(',', '.')) : 0;

            const data = { 
                codigo, 
                descricao: descricao.slice(0, 500), 
                unidade: unidade || 'UN', 
                valor_unitario: valor || 0, 
                categoria,
                data_base: dataBase, 
                fonte: 'SINAPI' 
            };
            
            const existing = await base44.entities.Input.filter({ codigo }, { limit: 1 });
            if (existing.length > 0) {
                 await base44.entities.Input.update(existing[0].id, data);
            } else {
                 await base44.entities.Input.create(data);
            }
        }
        return { success: true, count: validLines.length, type: 'INSUMO' };
        
    } else {
        // Composition Staging
        for (const line of validLines) {
            const cols = line.split(separator).map(c => c?.trim().replace(/"/g, ''));
            if (cols.length < 4) continue;

            const codPai = cols[0];
            const descPai = cols[1];
            const unPai = cols[2] || 'UN';
            const codFilho = cols[3];
            const qtdStr = cols[4];
            
            if (!codPai || !codFilho) continue;

            stagingItems.push({
                batch_id: batchId,
                codigo_pai: codPai,
                descricao_pai: descPai,
                unidade_pai: unPai,
                codigo_item: codFilho,
                quantidade: qtdStr ? parseFloat(qtdStr.replace(',', '.')) : 0,
                status: 'pendente'
            });
        }
        
        // Bulk Create in Chunks
        const chunkSize = 500;
        for (let i = 0; i < stagingItems.length; i += chunkSize) {
            const chunk = stagingItems.slice(i, i + chunkSize);
            await base44.entities.CompositionStaging.bulkCreate(chunk);
        }
        
        return { success: true, count: stagingItems.length, type: 'COMPOSICAO' };
    }
}