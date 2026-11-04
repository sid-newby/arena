import { useEffect } from 'react';
import { RoomNav } from '@/components/room-nav';
import { ThemeControls } from '@/components/theme-controls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import './research-center.css';

export function ResearchCenter() {
  useEffect(() => {
    document.title = 'Prismatic Research Center · Arena';
  }, []);
  return (
    <div className="room">
      <header className="room-header">
        <RoomNav current="prismatic" />
        <span className="room-description">Generative UI, drawn from the conversation.</span>
        <div className="room-tools">
          <ThemeControls />
        </div>
      </header>
      <main className="research-center" aria-label="Prismatic Research Center">
        <Card className="research-center-card">
          <CardHeader>
            <CardTitle>Prismatic Research Center</CardTitle>
            <CardDescription>
              This room will render its interface from the conversation with json-render. The
              scaffold is not in yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="research-center-note">
            Nothing here is live. The hangout and debate rooms are unchanged.
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
