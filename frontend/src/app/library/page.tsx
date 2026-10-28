import { PageHeader } from '@/components/page-states'
import { FileLibrary } from '@/app/data-sources/file-library'

export function LibraryPage() {
  return <div className="space-y-6"><PageHeader title="Library" description="Your retained billing files, ready for comparison and investigation" /><FileLibrary /></div>
}
