/**
 * Plain data the layout editor page hands to the client editor.
 */
export type EditorSectionOption = { id: string; name: string; parentId: string | null };
export type EditorTagOption = { id: string; name: string };
export type EditorContentTypeOption = { key: string; name: string };

export type LayoutEditorOptions = {
  sections: EditorSectionOption[];
  tags: EditorTagOption[];
  contentTypes: EditorContentTypeOption[];
};

export type LayoutEditorPermissions = { edit: boolean; publish: boolean };
