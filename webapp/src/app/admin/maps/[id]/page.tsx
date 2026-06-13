import { notFound } from 'next/navigation';
import { AdminMapScreen } from './AdminMapScreen';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminMapPage({ params }: Props) {
  const { id } = await params;
  const mapId = Number(id);
  if (!Number.isInteger(mapId) || mapId <= 0) notFound();
  return <AdminMapScreen mapId={mapId} />;
}
