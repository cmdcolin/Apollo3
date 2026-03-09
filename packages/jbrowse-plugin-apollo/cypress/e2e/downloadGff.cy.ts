describe('Download GFF', () => {
  beforeEach(() => {
    cy.exec(`rm ${Cypress.config('downloadsFolder')}/*_apollo.gff3`, {
      failOnNonZeroExit: false,
    }).then((result) => {
      cy.log(result.stderr)
    })
    cy.loginAsGuest()
  })

  afterEach(() => {
    cy.deleteAssemblies()
  })

  it('Can download gff with fasta', () => {
    cy.addAssemblyFromGff('volvox.fasta.gff3', 'test_data/volvox.fasta.gff3')
    cy.selectFromApolloMenu('Download GFF3')
    cy.focused()
      .contains('Select assembly')
      .parent()
      .within(() => {
        cy.get('input').parent().first().click()
      })
    cy.get('li').contains('volvox.fasta.gff3').click()
    cy.get('label[data-testid="include-fasta-checkbox"]').within(() => {
      cy.get('input').click()
    })
    cy.intercept('GET', '**/export?exportID=*').as('downloadGff3')
    cy.get('button').contains('Download').click()
    cy.wait('@downloadGff3', { timeout: 30_000 })
      .its('response.body')
      .then((body: string) => {
        const lines = body.trim().split('\n')
        cy.task('log', `[DEBUG downloadGff] got ${lines.length} lines`)
        expect(lines.length).eq(960)
      })
  })

  it('Can download gff without fasta', () => {
    cy.addAssemblyFromGff('volvox.fasta.gff3', 'test_data/volvox.fasta.gff3')
    cy.selectFromApolloMenu('Download GFF3')
    cy.focused()
      .contains('Select assembly')
      .parent()
      .within(() => {
        cy.get('input').parent().first().click()
      })
    cy.get('li').contains('volvox.fasta.gff3').click()
    cy.intercept('GET', '**/export?exportID=*').as('downloadGff3')
    cy.get('button').contains('Download').click()
    cy.wait('@downloadGff3', { timeout: 30_000 })
      .its('response.body')
      .then((body: string) => {
        const lines = body.trim().split('\n')
        cy.task('log', `[DEBUG downloadGff] got ${lines.length} lines`)
        expect(lines.length).eq(255)
      })
  })
})
