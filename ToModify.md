## Prompt: 
First and before starting with all these fixes, that i see we can work on by lunching multiple sub agents that will execute a plan, lunch more cost friendly agents like hikaru or sonnet ones, while using the current model (opus 4.8) to create a plan and supervise each agent and verifying their outputs, go and pull from the repo that we worked this project from see what changes he made to the parts of the app that we already have atm and return to me what was newly added to see if it a good fit and i can add it or not (ignore folders of the microservice part)


# Dashboard fixes at (http://localhost:4200/applications/dashboard)
- [X] in the dashboard the 4 cards design should be redone in a better way as i don't like it at all
- [X] the "24 credits left this month" part isn't usefull as this is a toold, change that part with something more usefull to me
- [X] "Your pipeline" section looks stretched (white space under it) due to the "Follow-ups" section being filled so make the your pipeline graph better ![alt text](image-1.png)
- [X] for settings add an icon beside it

# Application fixes:
- [X] while adding an application add the option to save the contact at the contact list
- [X] for the kanban page some companies with long names looks out of their box like :![alt text](image.png)
- [X] in the application process replace "Screening" with "Seen" as screening doesn't mean nothing to me
- [X] activity page should also show deleted applications if any
- [X] for the analytic page, the "Email & schedules" should show instead the ways i used to apply and the "Applications over time" should have more time options like week, month

# Calender fixes at (http://localhost:4200/applications/calendar):
- [X] remove the Board, List, Today as they don't work and also make the filter work

# MailBox:
- [X] i need to redo the templates in the compose tab
- [X] fix contact UI

# Documents:
- [X] each CV have Tags, as i might upload the same cv with different version and i should see analytics about CV sent and how that chnaged the analytics for applications(analytic page of applications)
- [X] Images uploads doesn't work for contact 

# My Career
- [X] forms verified working (wired to /api/user-content/*, proxied by gateway); you fill in the projects/skills data manually

