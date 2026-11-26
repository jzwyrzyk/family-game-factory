export interface SemanticFields {
  semanticIdentity?: string;
  semanticName?: string;
}

/** semanticName was used by the first integrated candidate. Keep existing
 * records readable and use the shared semanticIdentity key for new records. */
export function semanticWord(fields: SemanticFields): string | undefined {
  const {semanticIdentity, semanticName} = fields;
  for (const value of [semanticIdentity, semanticName]) {
    if (value !== undefined && (typeof value !== 'string' || value.length > 60 || /[\u0000-\u001f\u007f]/u.test(value))) {
      throw Error('Choose a short word for your artwork.');
    }
  }
  if (semanticIdentity !== undefined && semanticName !== undefined && semanticIdentity.trim() !== semanticName.trim()) {
    throw Error('This artwork has two different words for the same object. Its saved details need recovery.');
  }
  return (semanticIdentity ?? semanticName)?.trim() || undefined;
}

export function setSemanticWord(fields: SemanticFields, word: string | undefined) {
  delete fields.semanticName;
  if (word) fields.semanticIdentity = word;
  else delete fields.semanticIdentity;
}
