import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { xmlContent, supplierId, workId } = await req.json();

    // Parse XML simples (para produção, usar uma biblioteca XML apropriada)
    const parseXml = (xml) => {
      const regex = (pattern) => {
        const match = xml.match(pattern);
        return match ? match[1] : null;
      };

      const items = [];
      const detRegex = /<det\s+nItem="(\d+)">(.*?)<\/det>/gs;
      let detMatch;
      
      while ((detMatch = detRegex.exec(xml)) !== null) {
        const detContent = detMatch[2];
        items.push({
          codigo: regex.call({ match: (p) => detContent.match(p) }, /cProd[^>]*>(.*?)<\/cProd/),
          descricao: regex.call({ match: (p) => detContent.match(p) }, /xProd[^>]*>(.*?)<\/xProd/),
          ncm: regex.call({ match: (p) => detContent.match(p) }, /NCM[^>]*>(.*?)<\/NCM/),
          unidade: regex.call({ match: (p) => detContent.match(p) }, /uCom[^>]*>(.*?)<\/uCom/),
          quantidade: parseFloat(regex.call({ match: (p) => detContent.match(p) }, /qCom[^>]*>(.*?)<\/qCom/) || 0),
          valorUnitario: parseFloat(regex.call({ match: (p) => detContent.match(p) }, /vUnCom[^>]*>(.*?)<\/vUnCom/) || 0)
        });
      }

      return {
        numeroNota: regex(/nNF[^>]*>(.*?)<\/nNF/),
        serie: regex(/serie[^>]*>(.*?)<\/serie/),
        chaveAcesso: regex(/cUF>\d+(\d{43})</),
        dataEmissao: regex(/dhEmi[^>]*>(.*?)T/),
        fornecedorCnpj: regex(/emit[^>]*>.*?<CNPJ[^>]*>(.*?)<\/CNPJ/s),
        fornecedorNome: regex(/emit[^>]*>.*?<xNome[^>]*>(.*?)<\/xNome/s),
        valorTotal: parseFloat(regex(/vNF[^>]*>(.*?)<\/vNF/) || 0),
        valorProdutos: parseFloat(regex(/vProd[^>]*>(.*?)<\/vProd/) || 0),
        valorIcms: parseFloat(regex(/vICMS[^>]*>(.*?)<\/vICMS/) || 0),
        items: items
      };
    };

    const notaData = parseXml(xmlContent);

    // Buscar fornecedor
    const suppliers = await base44.asServiceRole.entities.Supplier.filter({ cnpj: notaData.fornecedorCnpj });
    const supplier = suppliers[0];

    if (!supplier) {
      return Response.json({ 
        success: false, 
        error: 'Fornecedor não encontrado. Cadastre o fornecedor antes de importar a nota.' 
      }, { status: 400 });
    }

    // Criar registro de Invoice
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      numero_nota: notaData.numeroNota,
      serie: notaData.serie,
      chave_acesso: notaData.chaveAcesso,
      data_emissao: notaData.dataEmissao,
      fornecedor_id: supplier.id,
      fornecedor_nome: supplier.razao_social,
      fornecedor_cnpj: supplier.cnpj,
      valor_total: notaData.valorTotal,
      valor_produtos: notaData.valorProdutos,
      valor_icms: notaData.valorIcms,
      obra_id: workId,
      status: 'importada',
      xml_base64: btoa(xmlContent)
    });

    // Processar itens
    const processedItems = [];
    
    for (const item of notaData.items) {
      // Buscar insumo pelo nome/descrição (busca fuzzy)
      const inputs = await base44.asServiceRole.entities.Input.list();
      const matchedInput = inputs.find(inp => 
        inp.descricao?.toLowerCase().includes(item.descricao?.toLowerCase()) ||
        inp.codigo === item.codigo
      );

      await base44.asServiceRole.entities.InvoiceItem.create({
        nota_fiscal_id: invoice.id,
        codigo_xml: item.codigo,
        descricao_xml: item.descricao,
        insumo_id: matchedInput?.id || null,
        insumo_codigo: matchedInput?.codigo || null,
        insumo_nome: matchedInput?.descricao || null,
        unidade_xml: item.unidade,
        unidade_insumo: matchedInput?.unidade || null,
        quantidade_xml: item.quantidade,
        valor_unitario_xml: item.valorUnitario,
        ncm: item.ncm,
        status_mapeamento: matchedInput ? 'mapeado' : 'nao_mapeado'
      });

      processedItems.push({
        codigo: item.codigo,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
        mapeado: !!matchedInput
      });
    }

    return Response.json({ 
      success: true, 
      invoice: invoice.id,
      items: processedItems,
      message: 'Nota fiscal importada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao processar XML:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});