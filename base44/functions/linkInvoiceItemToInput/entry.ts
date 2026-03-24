import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceItemId, inputId, conversionFactor, motivo } = await req.json();

    // Buscar InvoiceItem
    const invoiceItem = await base44.asServiceRole.entities.InvoiceItem.read(invoiceItemId);
    const input = await base44.asServiceRole.entities.Input.read(inputId);

    if (!invoiceItem || !input) {
      return Response.json({ 
        success: false, 
        error: 'InvoiceItem ou Insumo não encontrado' 
      }, { status: 400 });
    }

    // Calcular quantidade convertida
    const quantidadeConvertida = invoiceItem.quantidade_xml * (conversionFactor || 1);
    const valorUnitarioConvertido = invoiceItem.valor_unitario_xml / (conversionFactor || 1);

    // Atualizar InvoiceItem com mapeamento
    await base44.asServiceRole.entities.InvoiceItem.update(invoiceItemId, {
      insumo_id: inputId,
      insumo_codigo: input.codigo,
      insumo_nome: input.descricao,
      unidade_insumo: input.unidade,
      quantidade_convertida: quantidadeConvertida,
      valor_unitario_convertido: valorUnitarioConvertido,
      valor_total: quantidadeConvertida * valorUnitarioConvertido,
      status_mapeamento: 'mapeado',
      motivo_ajuste: motivo
    });

    // Buscar a Invoice para dados da compra
    const nota = await base44.asServiceRole.entities.Invoice.read(invoiceItem.nota_fiscal_id);

    // Criar registro no InputPurchaseHistory
    await base44.asServiceRole.entities.InputPurchaseHistory.create({
      insumo_id: inputId,
      insumo_codigo: input.codigo,
      insumo_nome: input.descricao,
      nota_fiscal_id: invoiceItem.nota_fiscal_id,
      numero_nota: nota.numero_nota,
      fornecedor_id: nota.fornecedor_id,
      fornecedor_nome: nota.fornecedor_nome,
      data_compra: nota.data_emissao,
      quantidade: quantidadeConvertida,
      unidade: input.unidade,
      valor_unitario: valorUnitarioConvertido,
      valor_total: quantidadeConvertida * valorUnitarioConvertido,
      obra_id: nota.obra_id,
      obra_nome: nota.obra_nome
    });

    return Response.json({ 
      success: true,
      message: 'Insumo vinculado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao vincular insumo:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});