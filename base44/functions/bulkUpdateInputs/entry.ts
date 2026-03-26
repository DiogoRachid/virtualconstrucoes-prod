import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { updates } = await req.json();
    // updates: Array of { id: string, data: object }

    if (!updates || !Array.isArray(updates)) {
      return Response.json({ error: 'updates deve ser um array' }, { status: 400 });
    }

    let done = 0;
    const errors = [];

    // Processa em chunks de 20 simultâneos para não sobrecarregar
    const CHUNK = 20;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(({ id, data }) =>
          base44.entities.Input.update(id, data).catch(e => {
            errors.push({ id, error: e.message });
          })
        )
      );
      done += chunk.length;
    }

    return Response.json({ done, errors_count: errors.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});