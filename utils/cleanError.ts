export function cleanError(error: any) {
  const text = String(error?.message || error || '');

  if (text.includes('content_policy_violation')) {
    return 'El archivo ha sido bloqueado por el proveedor de IA. Prueba con otra foto o vídeo.';
  }

  if (text.includes('timeout')) {
    return 'La generación ha tardado demasiado. Prueba con un vídeo más corto.';
  }

  if (text.includes('Insufficient') || text.includes('balance')) {
    return 'El proveedor indica saldo insuficiente.';
  }

  return 'Algo falló conectando con la IA. Prueba otra vez.';
}