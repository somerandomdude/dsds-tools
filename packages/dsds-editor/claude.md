# DSDS editor

This directory is to create a visual editor for DSDS (https://designsystemdocspec.org/). This tool lets people create, edit, and manage DSDS-based docs with visual tools. 

## Functional requirements
* A person should be able to create a new DSDS project that's based on a filesystem directory.
* All files created in the project are added to the filesystem. 
* History does not need to be managed
* No data needs to be stored in a database
* All data should be read directly from the project's JSON files in the filesystem
* The app should be native (Mac only for now)

## UI
* The UI should mimic common text-editor paradigms, such as Zed.
* The interface should be a three-column layout
  * The start-aligned column manages all docs (e.g., button.dsds.json). It allows for adding new files, deleting files, renaming files, etc.
  * The middle column manages doc writing. All properties in the doc are edited in this space
  * The end-aligned column manages metadata of the selected document (e.g., filename, last updated, etc.)
* Keep the CSS minimal outside of layout. Keep basic elements unstyled.

## Technical requirements
* Tauri-based stack
* When necessary, use web components. Avoid any JS framework for UI elements. 
* Avoid React for state management and data-binding. Find a simpler/lighter JS framework if necessary. Ideally, use none at all if it doesn't degrade simplicity and maintainability
* Use as few third-party libraries as possible
* The code should have full test coverage
