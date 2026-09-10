import { useState } from 'react'
import { Box, Button, Flex, Heading, VStack } from '@sanity/ui-v5'
import { TextInput } from '@sanity/ui'
import { SearchIcon } from '@sanity/icons/Search'
import SettingsHub from './SettingsHub'

export default function App() {
  const [searchQuery, setSearchQuery] = useState('')

  const handleReset = () => {
    setSearchQuery('')
  }

  return (
    // UI-CODEMOD TODO: Please double check the Box migration below
    <Box minHeight="100vh">
      {/* Fixed Header */}
      <Box
        borderBottom={true}
        padding={4}
        position="sticky"
        top={0}
        zIndex={10}
      >
        // UI-CODEMOD TODO: Please double check the Box migration below
        <Box maxWidth="1200px" marginX="auto">
          <VStack gap={3}>
            <Heading as="h1" size={5} trim>
              Smart Home Settings
            </Heading>
            <Flex gap={3} alignItems="center" flexWrap="wrap">
              // UI-CODEMOD TODO: Please double check the Box migration below
              <Box flexGrow={1} minWidth="200px">
                <TextInput
                  icon={SearchIcon}
                  placeholder="Search settings (e.g., lighting, temperature)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  aria-label="Search settings"
                />
              </Box>
              <Button onClick={handleReset}>
                Reset to defaults
              </Button>
            </Flex>
          </VStack>
        </Box>
      </Box>

      {/* Main Content */}
      // UI-CODEMOD TODO: Please double check the Box migration below
      <Box padding={4} minHeight="100vh">
        // UI-CODEMOD TODO: Please double check the Box migration below
        <Box maxWidth="1200px" marginX="auto">
          <SettingsHub searchQuery={searchQuery} />
        </Box>
      </Box>
    </Box>
  );
}
