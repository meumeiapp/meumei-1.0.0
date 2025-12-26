export const getPrimaryActionLabel = (entityName: string, isEditing: boolean) => {
  const name = entityName.trim();
  return isEditing ? 'Salvar alterações' : `Adicionar ${name}`;
};
