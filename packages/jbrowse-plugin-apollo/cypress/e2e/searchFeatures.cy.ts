// Tests that use space.gff3 and volvox.fasta.gff3 are read-only, so each
// group loads its assembly once in before() and shares it across all tests.
describe('Search features', () => {
  describe('space.gff3 searches', () => {
    before(() => {
      cy.loginAsGuest()
      cy.deleteAssemblies()
      cy.addAssemblyFromGff('space.gff3', 'test_data/space.gff3', false)
    })

    beforeEach(() => {
      cy.loginAsGuest()
      cy.contains('Launch view', { timeout: 10_000 }).click()
    })

    after(() => {
      cy.deleteAssemblies()
    })

    it('FIXME: Use of quotes', () => {
      cy.selectAssemblyToView('space.gff3')
      cy.searchFeatures('"agt A"', 4) // Should return 2 matches
    })

    it('Full word and word stem matching', () => {
      cy.selectAssemblyToView('space.gff3')

      cy.searchFeatures('transmem', 0)
      cy.searchFeatures('transmembrane', 1)
      cy.currentLocationEquals('ctgA', 9444, 9976, 10)
      cy.searchFeatures('7-transmembrane', 1)
      cy.searchFeatures('someKeyWord', 1)
      cy.searchFeatures('mRNA', 1)
      cy.searchFeatures('UTRs', 1)
      cy.searchFeatures('UTR', 1) // Search works on word stems (UTR as well as UTRs)
      cy.searchFeatures('with', 0) // Stop words are ignored
      cy.searchFeatures('both', 0) // Stop words are ignored
      cy.searchFeatures('and', 0) // Stop words are ignored
    })

    it('Can handle space in attribute values', () => {
      cy.selectAssemblyToView('space.gff3')

      cy.searchFeatures('agt 2', 1)
      cy.currentLocationEquals('ctgA', 1, 8410, 10)

      // TODO: see if there's a way to get this search to work
      cy.searchFeatures('spam"foo"eggs', 0)

      cy.searchFeatures('thisDoesNotExist', 0)
      // Make sure we didn't change location after a failed search
      cy.currentLocationEquals('ctgA', 1, 8410, 10)

      cy.searchFeatures('agt B', 1)
      cy.currentLocationEquals('ctgA', 7800, 9200, 10)

      cy.searchFeatures('agt 1', 2)
    })
  })

  describe('volvox.fasta.gff3 searches', () => {
    before(() => {
      cy.loginAsGuest()
      cy.deleteAssemblies()
      cy.addAssemblyFromGff(
        'volvox.fasta.gff3',
        'test_data/volvox.fasta.gff3',
        false,
      )
    })

    beforeEach(() => {
      cy.loginAsGuest()
      cy.contains('Launch view', { timeout: 10_000 }).click()
    })

    after(() => {
      cy.deleteAssemblies()
    })

    it('One hit with no children', () => {
      cy.selectAssemblyToView('volvox.fasta.gff3', 'Match6')
      cy.currentLocationEquals('ctgA', 7800, 9200, 10)
    })

    it('Match is not case sensitive', () => {
      cy.selectAssemblyToView('volvox.fasta.gff3', 'match6')
      cy.currentLocationEquals('ctgA', 7800, 9200, 10)
    })

    it('Decode URL escapes', () => {
      cy.selectAssemblyToView('volvox.fasta.gff3')
      cy.searchFeatures('Some%2CNote', 0)
      cy.searchFeatures('Some,Note', 1)
      cy.currentLocationEquals('ctgA', 800, 2200, 10)
    })

    it('One matching parent and multiple matching children', () => {
      cy.selectAssemblyToView('volvox.fasta.gff3', 'EDEN')
      cy.currentLocationEquals('ctgA', 1, 10_590, 10)
    })

    it('Select from multiple hits', () => {
      cy.selectAssemblyToView('volvox.fasta.gff3')
      cy.searchFeatures('hga', 3)
      cy.contains('td', 'ctgA:1,000..2,000')
        .parent()
        .within(() => {
          cy.contains('button', /^Go$/, { matchCase: false }).click()
          cy.wait('@search hga')
        })
      cy.currentLocationEquals('ctgA', 800, 2200, 10)

      cy.searchFeatures('hgb', 2)
    })
  })

  describe('Multi-assembly search', () => {
    beforeEach(() => {
      cy.loginAsGuest()
      cy.deleteAssemblies()
    })

    afterEach(() => {
      cy.deleteAssemblies()
    })

    it('Search only the selected assembly', () => {
      cy.addAssemblyFromGff('volvox.fasta.gff3', 'test_data/volvox.fasta.gff3')
      cy.addAssemblyFromGff(
        'volvox2.fasta.gff3',
        'test_data/volvox2.fasta.gff3',
        false,
      )

      cy.selectAssemblyToView('volvox2.fasta.gff3', 'SpamGene')
      cy.currentLocationEquals('ctgA', 80, 220, 10)

      cy.visit('/?config=http://localhost:3999/jbrowse/config.json')
      cy.contains('Launch view', { timeout: 10_000 }).click()
      cy.selectAssemblyToView('volvox.fasta.gff3')
      cy.searchFeatures('SpamGene', 0)
    })
  })
})
