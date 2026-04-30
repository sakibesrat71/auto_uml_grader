import { UxfParserService } from './uxf-parser.service';

describe('UxfParserService', () => {
  const service = new UxfParserService();

  it('parses UMLet classes, PK/FK attributes, and relationships', () => {
    const diagram = `<?xml version="1.0" encoding="UTF-8"?>
<diagram program="umlet" version="15.1">
  <zoom_level>10</zoom_level>
  <element>
    <id>UMLClass</id>
    <coordinates><x>0</x><y>0</y><w>120</w><h>80</h></coordinates>
    <panel_attributes>Publication
--
-isbn (PK)
-title</panel_attributes>
    <additional_attributes/>
  </element>
  <element>
    <id>UMLClass</id>
    <coordinates><x>200</x><y>0</y><w>120</w><h>80</h></coordinates>
    <panel_attributes>BookChapter
--
-isbn (PK, FK-&gt;Publication.isbn)
-chapterNumber</panel_attributes>
    <additional_attributes/>
  </element>
  <element>
    <id>Relation</id>
    <coordinates><x>110</x><y>30</y><w>100</w><h>20</h></coordinates>
    <panel_attributes>lt=&lt;&lt;&lt;&lt;-</panel_attributes>
    <additional_attributes>10.0;10.0;90.0;10.0</additional_attributes>
  </element>
</diagram>`;

    const parsed = service.parse(diagram);

    expect(parsed.metadata).toMatchObject({
      program: 'umlet',
      version: '15.1',
      classCount: 2,
      relationshipCount: 1,
      unlinkedRelationshipCount: 0,
    });
    const publication = parsed.classes.find(
      (item) => item.name === 'Publication',
    );
    const bookChapter = parsed.classes.find(
      (item) => item.name === 'BookChapter',
    );

    expect(publication?.methods).toEqual([]);
    expect(
      publication?.attributes.find((item) => item.name === 'isbn'),
    ).toEqual(expect.objectContaining({ notes: ['PK'] }));
    expect(bookChapter?.methods).toEqual([]);
    expect(
      bookChapter?.attributes.find((item) => item.name === 'isbn'),
    ).toEqual(
      expect.objectContaining({ notes: ['PK', 'FK->Publication.isbn'] }),
    );
    expect(parsed.relationships[0]).toMatchObject({
      source: 'Publication',
      target: 'BookChapter',
      type: 'inheritance',
    });
  });
});
