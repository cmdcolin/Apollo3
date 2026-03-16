/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { getParent } from '@jbrowse/mobx-state-tree'
import {
  Autocomplete,
  type AutocompleteRenderValueGetItemProps,
  Chip,
  Grid,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { debounce } from '@mui/material/utils'
import highlightMatch from 'autosuggest-highlight/match'
import highlightParse from 'autosuggest-highlight/parse'
import * as React from 'react'

import {
  type OntologyManager,
  type OntologyRecord,
  type OntologyTerm,
  isOntologyClass,
} from '../OntologyManager'
import { isDeprecated } from '../OntologyManager/OntologyLookup'
import type { ApolloSessionModel } from '../session'

interface FulltextMatch {
  term: OntologyTerm
  fieldName: string
}

interface TermValue {
  term: OntologyTerm
  matches?: FulltextMatch[]
}

function TermTagWithTooltip({
  getItemProps,
  index,
  ontology,
  termId,
}: {
  termId: string
  index: number
  getItemProps: AutocompleteRenderValueGetItemProps<true>
  ontology: OntologyRecord
}) {
  const manager = getParent<OntologyManager>(ontology, 2)

  const [description, setDescription] = React.useState('')

  React.useEffect(() => {
    const { dataStore } = ontology
    if (!dataStore) {
      return
    }
    const termUrl = manager.expandPrefixes(termId)
    const term = dataStore.getNodeById(termUrl)
    if (term?.lbl) {
      setDescription(term.lbl)
    }
  }, [termId, ontology, manager])

  return (
    <Tooltip title={description}>
      <div>
        <Chip
          label={manager.applyPrefixes(termId)}
          size="small"
          {...getItemProps({ index })}
        />
      </div>
    </Tooltip>
  )
}

export function OntologyTermMultiSelect({
  includeDeprecated,
  onChange,
  ontologyName,
  ontologyVersion,
  session,
  value: initialValue,
  label,
}: {
  session: ApolloSessionModel
  value: string[]
  ontologyName: string
  ontologyVersion?: string
  /** if true, include deprecated/obsolete terms */
  includeDeprecated?: boolean
  onChange(newValue: string[]): void
  label?: string
}) {
  const { ontologyManager } = session.apolloDataStore
  const ontology = ontologyManager.findOntology(ontologyName, ontologyVersion)

  const [value, setValue] = React.useState<TermValue[]>(
    initialValue.map((id) => ({ term: { id, type: 'CLASS' } })),
  )
  const [inputValue, setInputValue] = React.useState('')
  const [options, setOptions] = React.useState<readonly TermValue[]>([])
  const [loading, setLoading] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState('')

  const getOntologyTerms = React.useMemo(
    () =>
      debounce(
        (
          request: { input: string },
          callback: (results: TermValue[]) => void,
        ) => {
          if (!ontology) {
            return
          }
          const { dataStore } = ontology
          if (!dataStore) {
            return
          }
          const { input } = request
          try {
            const matches = dataStore.getTermsByFulltext(input)
            // aggregate the matches by term
            const byTerm = new Map<string, Required<TermValue>>()
            const options: Required<TermValue>[] = []
            for (const match of matches) {
              if (
                !isOntologyClass(match.term) ||
                (!includeDeprecated && isDeprecated(match.term))
              ) {
                continue
              }
              let slot = byTerm.get(match.term.id)
              if (!slot) {
                slot = { term: match.term, matches: [] }
                byTerm.set(match.term.id, slot)
                options.push(slot)
              }
              slot.matches.push(match)
            }
            callback(options)
          } catch (error) {
            setErrorMessage(String(error))
          }
        },
        400,
      ),
    [includeDeprecated, ontology],
  )

  React.useEffect(() => {
    if (inputValue === '') {
      setOptions([])
      return
    }

    setLoading(true)

    void getOntologyTerms({ input: inputValue }, (results) => {
      let newOptions: readonly TermValue[] = []
      if (value.length > 0) {
        newOptions = value
      }
      if (results) {
        newOptions = [...newOptions, ...results]
      }
      setOptions(newOptions)
      setLoading(false)
    })
  }, [getOntologyTerms, ontology, includeDeprecated, inputValue, value])

  if (!ontology) {
    return null
  }

  const extraTextFieldParams: { error?: boolean; helperText?: string } = {}
  if (errorMessage) {
    extraTextFieldParams.error = true
    extraTextFieldParams.helperText = errorMessage
  }

  return (
    <Autocomplete
      getOptionLabel={(option) => ontologyManager.applyPrefixes(option.term.id)}
      filterOptions={(terms) => terms.filter((t) => isOntologyClass(t.term))}
      options={options}
      autoComplete
      includeInputInList
      filterSelectedOptions
      value={value}
      loading={loading}
      isOptionEqualToValue={(option, v) =>
        ontologyManager.applyPrefixes(option.term.id) ===
        ontologyManager.applyPrefixes(v.term.id)
      }
      noOptionsText={inputValue ? 'No matches' : 'Start typing to search'}
      onChange={(_, newValue) => {
        setOptions(newValue ? [...newValue, ...options] : options)
        onChange(newValue.map((v) => ontologyManager.applyPrefixes(v.term.id)))
        setValue(newValue)
      }}
      onInputChange={(event, newInputValue) => {
        if (newInputValue) {
          setLoading(true)
        }
        setOptions([])
        setInputValue(newInputValue)
      }}
      multiple
      renderInput={(params) => (
        <TextField
          {...params}
          {...extraTextFieldParams}
          variant="outlined"
          label={label}
          fullWidth
        />
      )}
      renderOption={(props, option) => (
        <Option
          {...props}
          ontologyManager={ontologyManager}
          option={option}
          inputValue={inputValue}
        />
      )}
      renderValue={(v, getItemProps) =>
        v.map((option, index) => (
          <TermTagWithTooltip
            termId={option.term.id}
            index={index}
            ontology={ontology}
            getItemProps={getItemProps}
            key={option.term.id}
          />
        ))
      }
    />
  )
}

function HighlightedText(props: { str: string; search: string }) {
  const { search, str } = props

  const highlights = highlightMatch(str, search, {
    insideWords: true,
    findAllOccurrences: true,
  })
  const parts = highlightParse(str, highlights)
  return (
    <>
      {parts.map((part, index) => (
        <Typography
          key={index}
          component="span"
          sx={{ fontWeight: part.highlight ? 'bold' : 'regular' }}
          variant="body2"
          color="text.secondary"
        >
          {part.text}
        </Typography>
      ))}
    </>
  )
}
function Option(props: {
  ontologyManager: OntologyManager
  inputValue: string
  option: TermValue
}) {
  const { inputValue, ontologyManager, option, ...other } = props
  const matches = option.matches ?? []
  const fields = matches
    .filter((match) => match.fieldName !== 'Label')
    .map((match) => {
      return (
        <React.Fragment key={`option-${match.term.id}-${match.fieldName}`}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {match.fieldName}
          </Typography>
          <dd>
            <HighlightedText str={match.term.lbl ?? ''} search={inputValue} />
          </dd>
        </React.Fragment>
      )
    })
  // const lblScore = matches
  //   .filter((match) => match.field.jsonPath === '$.lbl')
  //   .map((m) => m.score)
  //   .join(', ')
  return (
    <li {...other}>
      <Grid container>
        <Grid>
          <Typography component="span">
            {ontologyManager.applyPrefixes(option.term.id)}
          </Typography>{' '}
          <HighlightedText
            str={option.term.lbl ?? '(no label)'}
            search={inputValue}
          />{' '}
          {/* ({lblScore}) */}
          <dl>{fields}</dl>
        </Grid>
      </Grid>
    </li>
  )
}
