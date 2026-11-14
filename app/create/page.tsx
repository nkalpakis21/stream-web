import { CreatePageClient } from '@/app/create/CreatePageClient';
import { publicStreamstarVoices } from '@/lib/voices/streamstarVoices';

export default function CreatePage() {
  return <CreatePageClient voices={publicStreamstarVoices()} />;
}
